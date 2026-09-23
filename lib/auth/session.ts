// Staff sessions (database backed, no framework imports).
//
// The cookie holds a random token; the database holds only its hash.
// Sessions end after SESSION_IDLE_MINUTES without activity or
// SESSION_MAX_HOURS after sign in, whichever comes first.

import { config } from '@/lib/config';
import { withChurch, type ChurchTx } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { hashToken, looksLikeToken, newToken } from './tokens';
import { churchForSession } from './lookup';
import { auditActorType, requiresTwoFactor, type StaffRole } from './permissions';

export async function hasActiveSupportGrant(tx: ChurchTx, staffUserId: string): Promise<boolean> {
  const grant = await tx.supportAccessGrant.findFirst({
    where: { supportStaffUserId: staffUserId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return grant !== null;
}

export async function createSession(tx: ChurchTx, churchId: string, staffUserId: string) {
  const token = newToken();
  const session = await tx.staffSession.create({
    data: {
      churchId,
      staffUserId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.sessionMaxHours() * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  return { token, sessionId: session.id };
}

export type SessionContext = {
  sessionId: string;
  churchId: string;
  churchName: string;
  staff: {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    isAccountAdmin: boolean;
    twoFactorEnabled: boolean;
  };
  needsTwoFactor: boolean;
  twoFactorVerified: boolean;
};

export type SessionResult =
  | { status: 'none' }
  | { status: 'ended' }
  | { status: 'active'; ctx: SessionContext };

const TOUCH_AFTER_MS = 60 * 1000;

export async function loadSession(cookieValue: string | undefined, ip: string | null): Promise<SessionResult> {
  if (!looksLikeToken(cookieValue)) return { status: 'none' };
  const tokenHash = hashToken(cookieValue);
  const churchId = await churchForSession(tokenHash);
  if (!churchId) return { status: 'none' };

  return withChurch(churchId, async (tx): Promise<SessionResult> => {
    const session = await tx.staffSession.findUnique({
      where: { tokenHash },
      include: { staffUser: true, church: { select: { name: true } } },
    });
    if (!session || session.endedAt) return { status: 'none' };

    const staff = session.staffUser;
    const role = staff.role as StaffRole;
    const now = Date.now();
    let endReason: string | null = null;
    if (now >= session.expiresAt.getTime()) endReason = 'reason:max_age';
    else if (now - session.lastSeenAt.getTime() > config.sessionIdleMinutes() * 60 * 1000) endReason = 'reason:idle';
    else if (!staff.active) endReason = 'reason:inactive';
    else if (role === 'founder_support' && !(await hasActiveSupportGrant(tx, staff.id))) endReason = 'reason:grant_expired';

    if (endReason) {
      await tx.staffSession.update({ where: { id: session.id }, data: { endedAt: new Date(now) } });
      await writeAudit(tx, {
        churchId, actorType: auditActorType(role), actorStaffId: staff.id,
        action: 'auth.session_timed_out', targetTable: 'staff_sessions', targetId: session.id,
        detail: endReason, ipAddress: ip,
      });
      return { status: 'ended' };
    }

    if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await tx.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }

    const needsTwoFactor = requiresTwoFactor({ role, isAccountAdmin: staff.isAccountAdmin });
    return {
      status: 'active',
      ctx: {
        sessionId: session.id,
        churchId,
        churchName: session.church.name,
        staff: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role,
          isAccountAdmin: staff.isAccountAdmin,
          twoFactorEnabled: staff.twoFactorEnabled,
        },
        needsTwoFactor,
        twoFactorVerified: session.twoFactorVerifiedAt !== null,
      },
    };
  });
}

export async function endSession(ctx: SessionContext, ip: string | null, detail = 'reason:sign_out'): Promise<void> {
  await withChurch(ctx.churchId, async (tx) => {
    const res = await tx.staffSession.updateMany({
      where: { id: ctx.sessionId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (res.count === 1) {
      await writeAudit(tx, {
        churchId: ctx.churchId, actorType: auditActorType(ctx.staff.role), actorStaffId: ctx.staff.id,
        action: 'auth.session_ended', targetTable: 'staff_sessions', targetId: ctx.sessionId,
        detail, ipAddress: ip,
      });
    }
  });
}
