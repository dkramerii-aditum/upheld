// Next.js glue: cookies, request IP, and page guards.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { config } from '@/lib/config';
import { clientIpFrom } from '@/lib/http/ip';
import { can, type Capability } from './permissions';
import { loadSession, type SessionContext } from './session';

export function sessionCookieName(): string {
  // __Host- cookies must be Secure, which requires HTTPS (production only).
  return config.isProduction() ? '__Host-upheld_session' : 'upheld_session';
}

export async function requestIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionMaxHours() * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}

// Loaded once per request, even when a layout and a page both ask.
export const currentSession = cache(async () => {
  const value = (await cookies()).get(sessionCookieName())?.value;
  return loadSession(value, await requestIp());
});

// For pages that require a signed in staff member. Staff who need two factor
// and have not passed it this session are sent to the two factor page.
export async function requireStaff(opts: { allowPendingTwoFactor?: boolean } = {}): Promise<SessionContext> {
  const result = await currentSession();
  if (result.status === 'none') redirect('/sign-in');
  if (result.status === 'ended') redirect('/sign-in?notice=expired');
  const ctx = result.ctx;
  if (ctx.needsTwoFactor && !ctx.twoFactorVerified && !opts.allowPendingTwoFactor) redirect('/auth/two-factor');
  return ctx;
}

export async function requireCapability(capability: Capability): Promise<SessionContext> {
  const ctx = await requireStaff();
  if (!can(ctx.staff, capability)) redirect('/today?notice=not_permitted');
  return ctx;
}
