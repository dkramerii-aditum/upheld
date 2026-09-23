// Time based one time codes (authenticator apps), required for care roles
// and account administrators. The secret is stored field encrypted. A code
// can be used only once, and five wrong codes end the session.

import { authenticator as baseAuthenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { TWO_FACTOR_MAX_FAILURES } from '@/lib/config';
import { withChurch } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { decryptField, encryptField } from '@/lib/crypto';
import { auditActorType } from './permissions';
import type { SessionContext } from './session';

// Accept the current 30 second window and one on either side for clock drift.
const authenticator = baseAuthenticator.clone({ window: 1 });

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / 30);
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

export type Enrollment = { qrDataUrl: string; manualKey: string };

// Returns enrollment details for staff who have not finished setup. The
// pending secret is created once and reused until the first good code.
export async function getOrCreateEnrollment(ctx: SessionContext): Promise<Enrollment | null> {
  const secret = await withChurch(ctx.churchId, async (tx) => {
    const staff = await tx.staffUser.findUnique({ where: { id: ctx.staff.id } });
    if (!staff || staff.twoFactorEnabled) return null;
    if (staff.twoFactorSecretCiphertext) return decryptField(staff.twoFactorSecretCiphertext);
    const fresh = authenticator.generateSecret();
    await tx.staffUser.update({
      where: { id: staff.id },
      data: { twoFactorSecretCiphertext: encryptField(fresh), twoFactorLastStep: null },
    });
    return fresh;
  });
  if (!secret) return null;
  const uri = authenticator.keyuri(ctx.staff.email, 'Upheld', secret);
  return { qrDataUrl: await toDataURL(uri), manualKey: secret.match(/.{1,4}/g)?.join(' ') ?? secret };
}

export type VerifyResult = 'ok' | 'bad_code' | 'locked';

export async function verifyTwoFactor(ctx: SessionContext, rawCode: unknown, ip: string | null): Promise<VerifyResult> {
  const code = normalizeCode(rawCode);
  const actorType = auditActorType(ctx.staff.role);

  return withChurch(ctx.churchId, async (tx): Promise<VerifyResult> => {
    const staff = await tx.staffUser.findUnique({ where: { id: ctx.staff.id } });
    const session = await tx.staffSession.findUnique({ where: { id: ctx.sessionId } });
    if (!staff || !session || session.endedAt || !staff.twoFactorSecretCiphertext) return 'locked';

    let step: number | null = null;
    if (code) {
      const delta = authenticator.checkDelta(code, decryptField(staff.twoFactorSecretCiphertext));
      if (delta !== null) step = currentStep() + delta;
    }
    const replay = step !== null && staff.twoFactorLastStep !== null && step <= staff.twoFactorLastStep;

    if (step === null || replay) {
      const failures = session.failedTwoFactorAttempts + 1;
      if (failures >= TWO_FACTOR_MAX_FAILURES) {
        await tx.staffSession.update({
          where: { id: session.id },
          data: { failedTwoFactorAttempts: failures, endedAt: new Date() },
        });
        await writeAudit(tx, {
          churchId: ctx.churchId, actorType, actorStaffId: staff.id, action: 'auth.two_factor_locked',
          targetTable: 'staff_sessions', targetId: session.id, ipAddress: ip,
        });
        return 'locked';
      }
      await tx.staffSession.update({ where: { id: session.id }, data: { failedTwoFactorAttempts: failures } });
      await writeAudit(tx, {
        churchId: ctx.churchId, actorType, actorStaffId: staff.id, action: 'auth.two_factor_failed',
        targetTable: 'staff_sessions', targetId: session.id, detail: replay ? 'reason:replay' : 'reason:bad_code',
        ipAddress: ip,
      });
      return 'bad_code';
    }

    const enrolling = !staff.twoFactorEnabled;
    await tx.staffUser.update({
      where: { id: staff.id },
      data: { twoFactorEnabled: true, twoFactorLastStep: step },
    });
    await tx.staffSession.update({
      where: { id: session.id },
      data: { twoFactorVerifiedAt: new Date(), failedTwoFactorAttempts: 0 },
    });
    if (enrolling) {
      await writeAudit(tx, {
        churchId: ctx.churchId, actorType, actorStaffId: staff.id, action: 'auth.two_factor_enrolled',
        targetTable: 'staff_users', targetId: staff.id, ipAddress: ip,
      });
    }
    await writeAudit(tx, {
      churchId: ctx.churchId, actorType, actorStaffId: staff.id, action: 'auth.two_factor_passed',
      targetTable: 'staff_sessions', targetId: session.id, ipAddress: ip,
    });
    return 'ok';
  });
}
