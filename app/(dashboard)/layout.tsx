import { signOutAction } from '@/app/actions/auth';
import { requireStaff } from '@/lib/auth/request';
import { ROLE_LABELS } from '@/lib/auth/permissions';

// Every dashboard screen sits inside this layout, which requires a signed in
// staff member who has passed two factor when their role requires it.
// Each screen still checks its own capability (see requireCapability).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  return (
    <main className="wide">
      <header className="bar">
        <div>
          <strong>{ctx.churchName}</strong>
          <span className="muted"> · {ctx.staff.name}, {ROLE_LABELS[ctx.staff.role]}</span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="link">Sign out</button>
        </form>
      </header>
      {children}
    </main>
  );
}
