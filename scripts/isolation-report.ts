// Human readable proof for the Milestone 1 done-when test.
// For each church, connects as the restricted app role inside that church's
// context and reports what it can see, then tries to read the other
// church's rows by id. Exits with an error if anything leaks.

import 'dotenv/config';
import { createOwnerPrisma } from '@/lib/db/owner';
import { getAppPrisma, withChurch } from '@/lib/db';

const owner = createOwnerPrisma();

async function main() {
  const churches = await owner.church.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (churches.length < 2) throw new Error('Need at least two churches. Run npm run db:seed first.');

  let leaks = 0;
  for (const c of churches) {
    const others = churches.filter((o) => o.id !== c.id).map((o) => o.id);
    const otherStaff = await owner.staffUser.findMany({ where: { churchId: { in: others } }, select: { id: true } });
    const otherMembers = await owner.member.findMany({ where: { churchId: { in: others } }, select: { id: true } });

    const seen = await withChurch(c.id, async (tx) => ({
      churches: await tx.church.count(),
      staff: await tx.staffUser.count(),
      members: await tx.member.count(),
      audit: await tx.auditLog.count(),
      otherStaffReadable: await tx.staffUser.count({ where: { id: { in: otherStaff.map((s) => s.id) } } }),
      otherMembersReadable: await tx.member.count({ where: { id: { in: otherMembers.map((m) => m.id) } } }),
      otherChurchReadable: await tx.church.count({ where: { id: { in: others } } }),
    }));

    const leaked = seen.otherStaffReadable + seen.otherMembersReadable + seen.otherChurchReadable;
    leaks += leaked + (seen.churches === 1 ? 0 : 1);
    console.log(`\n${c.name}`);
    console.log(`  sees churches: ${seen.churches}   staff: ${seen.staff}   members: ${seen.members}   audit entries: ${seen.audit}`);
    console.log(`  other churches' rows readable: ${leaked}  ${leaked === 0 ? 'PASS' : 'FAIL'}`);
  }

  const noContext = await getAppPrisma().staffUser.count();
  console.log(`\nWith no church selected, staff rows visible: ${noContext}  ${noContext === 0 ? 'PASS' : 'FAIL'}`);
  if (noContext !== 0) leaks += 1;

  console.log(leaks === 0 ? '\nRESULT: churches cannot see each other\'s data.' : '\nRESULT: ISOLATION FAILURE. Stop and report this.');
  if (leaks !== 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Report failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await owner.$disconnect();
    await getAppPrisma().$disconnect();
  });
