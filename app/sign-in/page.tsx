import { requestLinkAction } from '@/app/actions/auth';

const NOTICES: Record<string, { text: string; warn?: boolean }> = {
  sent: { text: 'If that address belongs to an Upheld staff account, a sign in link is on its way. It expires in 15 minutes.' },
  link: { text: 'That sign in link is not valid. It may have expired or already been used. Request a new one below.', warn: true },
  expired: { text: 'Your session ended. Please sign in again.' },
  locked: { text: 'Too many incorrect codes. Please request a new sign in link.', warn: true },
  signed_out: { text: 'You are signed out.' },
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const n = notice ? NOTICES[notice] : undefined;
  return (
    <main className="narrow">
      <h1>Upheld</h1>
      <p className="muted">Staff sign in</p>
      {n && <p className={n.warn ? 'notice warn' : 'notice'}>{n.text}</p>}
      <form action={requestLinkAction}>
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <button type="submit">Email me a sign in link</button>
      </form>
    </main>
  );
}
