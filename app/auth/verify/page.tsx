import { completeSignInAction } from '@/app/actions/auth';

// Opening the link does nothing by itself. Signing in needs the button,
// so email security scanners that open links cannot use the token up.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="narrow">
      <h1>Upheld</h1>
      {token ? (
        <form action={completeSignInAction}>
          <p>Continue to sign in to your church dashboard.</p>
          <input type="hidden" name="token" value={token} />
          <button type="submit">Sign in</button>
        </form>
      ) : (
        <p className="notice warn">This link is incomplete. Request a new one from the sign in page.</p>
      )}
    </main>
  );
}
