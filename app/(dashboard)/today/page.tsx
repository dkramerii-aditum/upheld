import { requireStaff } from '@/lib/auth/request';
import { CAPABILITY_LABELS, capabilitiesFor } from '@/lib/auth/permissions';
import { withChurch } from '@/lib/db';

// Milestone 1 placeholder for the Today screen. It shows who is signed in,
// which screens their role allows, and what this church can see in the
// database. Counts only; never member content.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const ctx = await requireStaff();
  const { notice } = await searchParams;
  const caps = capabilitiesFor(ctx.staff);

  const visible = await withChurch(ctx.churchId, async (tx) => ({
    churches: await tx.church.count(),
    staff: await tx.staffUser.count(),
    members: await tx.member.count(),
    auditEntries: await tx.auditLog.count(),
  }));

  return (
    <>
      {notice === 'not_permitted' && <p className="notice warn">Your role does not include that screen.</p>}
      <h1>Today</h1>
      <p className="muted">Milestone 1 foundation. Screens arrive in later milestones.</p>

      <h2>Screens your role allows</h2>
      <ul>
        {caps.map((c) => (
          <li key={c}>{CAPABILITY_LABELS[c]}</li>
        ))}
      </ul>

      <h2>What this church can see</h2>
      <table>
        <tbody>
          <tr><td>Churches visible</td><td>{visible.churches}</td></tr>
          <tr><td>Staff accounts</td><td>{visible.staff}</td></tr>
          <tr><td>Members</td><td>{visible.members}</td></tr>
          <tr><td>Audit log entries</td><td>{visible.auditEntries}</td></tr>
        </tbody>
      </table>
      <p className="muted">Churches visible should always be 1.</p>
    </>
  );
}
