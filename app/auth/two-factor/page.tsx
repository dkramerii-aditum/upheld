import { redirect } from 'next/navigation';
import { signOutAction, verifyTwoFactorAction } from '@/app/actions/auth';
import { requireStaff } from '@/lib/auth/request';
import { getOrCreateEnrollment } from '@/lib/auth/two-factor';

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const ctx = await requireStaff({ allowPendingTwoFactor: true });
  if (!ctx.needsTwoFactor || ctx.twoFactorVerified) redirect('/today');
  const { notice } = await searchParams;
  const enrollment = ctx.staff.twoFactorEnabled ? null : await getOrCreateEnrollment(ctx);

  return (
    <main className="narrow">
      <h1>Two step verification</h1>
      {notice === 'bad_code' && <p className="notice warn">That code did not work. Check your app and try again.</p>}
      {enrollment ? (
        <>
          <p>
            Your role can see care requests, so Upheld requires a code from an authenticator app
            (for example Google Authenticator, Microsoft Authenticator, or 1Password). Scan this code with the app.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrDataUrl} alt="Authenticator setup code" width={200} height={200} />
          <p className="muted">
            Or enter this key by hand: <code>{enrollment.manualKey}</code>
          </p>
        </>
      ) : (
        <p>Enter the six digit code from your authenticator app.</p>
      )}
      <form action={verifyTwoFactorAction}>
        <label htmlFor="code">Six digit code</label>
        <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
        <button type="submit">Verify</button>
      </form>
      <form action={signOutAction}>
        <p className="muted"><button type="submit" className="link">Sign out</button></p>
      </form>
    </main>
  );
}
