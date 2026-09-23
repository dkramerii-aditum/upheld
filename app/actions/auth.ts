'use server';

// Server actions for staff sign in. Next.js checks the request origin on
// every server action, which protects these forms from cross site posting.

import { redirect } from 'next/navigation';
import { completeSignIn, requestSignInLinks } from '@/lib/auth/magic-link';
import { verifyTwoFactor } from '@/lib/auth/two-factor';
import { clearSessionCookie, currentSession, requestIp, setSessionCookie } from '@/lib/auth/request';
import { endSession } from '@/lib/auth/session';

export async function requestLinkAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  try {
    await requestSignInLinks(email, await requestIp());
  } catch (err) {
    // Same response either way; log only the error type.
    console.error('Sign in request failed:', err instanceof Error ? err.name : 'unknown');
  }
  redirect('/sign-in?notice=sent');
}

export async function completeSignInAction(formData: FormData): Promise<void> {
  const result = await completeSignIn(formData.get('token'), await requestIp());
  if (!result.ok) redirect('/sign-in?notice=link');
  await setSessionCookie(result.sessionToken);
  redirect(result.needsTwoFactor ? '/auth/two-factor' : '/today');
}

export async function verifyTwoFactorAction(formData: FormData): Promise<void> {
  const session = await currentSession();
  if (session.status !== 'active') redirect('/sign-in?notice=expired');
  const outcome = await verifyTwoFactor(session.ctx, formData.get('code'), await requestIp());
  if (outcome === 'locked') {
    await clearSessionCookie();
    redirect('/sign-in?notice=locked');
  }
  if (outcome === 'bad_code') redirect('/auth/two-factor?notice=bad_code');
  redirect('/today');
}

export async function signOutAction(): Promise<void> {
  const session = await currentSession();
  if (session.status === 'active') await endSession(session.ctx, await requestIp());
  await clearSessionCookie();
  redirect('/sign-in?notice=signed_out');
}
