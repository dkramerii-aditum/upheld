// Magic link sign in.
//
// Request: look up active staff by email (possibly at more than one church),
// create a single use token per match, and email the links. The response to
// the visitor is the same whether or not the address matched anything.
//
// Complete: the link opens a confirmation page; the button posts the token
// back. (Email scanners that prefetch links therefore cannot use it up.)
// The token is consumed atomically and a session is created.

import { LOGIN_LINK_MINUTES, LOGIN_LINKS_PER_HOUR, config } from '@/lib/config';
import { withChurch } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { hashToken, looksLikeToken, newToken } from './tokens';
import { churchForLoginToken, findActiveStaffByEmail } from './lookup';
import { auditActorType, requiresTwoFactor, type StaffRole } from './permissions';
import { createSession, hasActiveSupportGrant } from './session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export async function requestSignInLinks(rawEmail: string, ip: string | null): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) return;

  const matches = await findActiveStaffByEmail(email);
  if (matches.length === 0) {
    // No audit row: there is no church to attach it to. Nothing identifying
    // is logged.
    console.info('Sign in requested for an address with no active staff account.');
    return;
  }

  const links: { churchName: string; url: string }[] = [];
  for (const m of matches) {
    const token = await withChurch(m.churchId, async (tx) => {
      const staff = await tx.staffUser.findUnique({ where: { id: m.staffId } });
      if (!staff || !staff.active) return null;
      if (staff.role === 'founder_support' && !(await hasActiveSupportGrant(tx, staff.id))) return null;

      const recent = await tx.staffLoginToken.count({
        where: { staffUserId: staff.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      });
      if (recent >= LOGIN_LINKS_PER_HOUR) return null;

      const raw = newToken();
      await tx.staffLoginToken.create({
        data: {
          churchId: m.churchId,
          staffUserId: staff.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + LOGIN_LINK_MINUTES * 60 * 1000),
        },
      });
      await writeAudit(tx, {
        churchId: m.churchId,
        actorType: auditActorType(staff.role as StaffRole),
        actorStaffId: staff.id,
        action: 'auth.link_requested',
        targetTable: 'staff_users',
        targetId: staff.id,
        ipAddress: ip,
      });
      return raw;
    });
    if (token) {
      links.push({ churchName: m.churchName, url: `${config.appBaseUrl()}/auth/verify?token=${token}` });
    }
  }

  if (links.length === 0) return;

  const body =
    links.length === 1
      ? [
          `Use this link to sign in to Upheld for ${links[0].churchName}.`,
          `It works once and expires in ${LOGIN_LINK_MINUTES} minutes.`,
          '',
          links[0].url,
        ]
      : [
          'Your email address is connected to more than one church on Upheld.',
          `Use the link for the church you want. Each works once and expires in ${LOGIN_LINK_MINUTES} minutes.`,
          '',
          ...links.flatMap((l) => [`${l.churchName}:`, l.url, '']),
        ];
  body.push('', 'If you did not ask to sign in, you can ignore this email.');

  await sendEmail({ to: email, subject: 'Your Upheld sign in link', text: body.join('\n') });
}

export type CompleteResult =
  | { ok: true; sessionToken: string; needsTwoFactor: boolean }
  | { ok: false };

export async function completeSignIn(rawToken: unknown, ip: string | null): Promise<CompleteResult> {
  if (!looksLikeToken(rawToken)) return { ok: false };
  const tokenHash = hashToken(rawToken);
  const churchId = await churchForLoginToken(tokenHash);
  if (!churchId) return { ok: false };

  return withChurch(churchId, async (tx): Promise<CompleteResult> => {
    // Atomic consume: only one request can flip used_at from null.
    const now = new Date();
    const consumed = await tx.staffLoginToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return { ok: false };

    const row = await tx.staffLoginToken.findUnique({ where: { tokenHash }, include: { staffUser: true } });
    const staff = row?.staffUser;
    if (!row || !staff || !staff.active) return { ok: false };

    const role = staff.role as StaffRole;
    const actorType = auditActorType(role);
    if (role === 'founder_support' && !(await hasActiveSupportGrant(tx, staff.id))) {
      await writeAudit(tx, {
        churchId, actorType, actorStaffId: staff.id, action: 'auth.access_denied',
        targetTable: 'staff_users', targetId: staff.id, detail: 'reason:no_support_grant', ipAddress: ip,
      });
      return { ok: false };
    }

    await writeAudit(tx, {
      churchId, actorType, actorStaffId: staff.id, action: 'auth.link_used',
      targetTable: 'staff_users', targetId: staff.id, ipAddress: ip,
    });

    const { token: sessionToken, sessionId } = await createSession(tx, churchId, staff.id);
    await tx.staffUser.update({ where: { id: staff.id }, data: { lastLoginAt: now } });
    await writeAudit(tx, {
      churchId, actorType, actorStaffId: staff.id, action: 'auth.session_started',
      targetTable: 'staff_sessions', targetId: sessionId, ipAddress: ip,
    });

    return {
      ok: true,
      sessionToken,
      needsTwoFactor: requiresTwoFactor({ role, isAccountAdmin: staff.isAccountAdmin }),
    };
  });
}
