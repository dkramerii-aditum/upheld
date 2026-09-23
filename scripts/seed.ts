// Creates the two Milestone 1 test churches in the development database.
// Safe to run more than once. Uses the owner connection (scripts only).
//
// Test Church North: you are senior pastor and account administrator
//                    (two factor required), plus one care staff account.
// Test Church South: a different senior pastor, and you as insights only
//                    (no two factor), so you can sign in to both churches
//                    and compare what each one can see.
// Member rows are fictional placeholders with 555 numbers, encrypted.

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createOwnerPrisma } from '@/lib/db/owner';
import { encryptField } from '@/lib/crypto';

const prisma = createOwnerPrisma();

type SeedChurch = {
  name: string;
  keyword: string;
  seniorPastorName: string;
  staff: { name: string; email: string; role: 'senior_pastor' | 'care_staff' | 'insights_only'; isAccountAdmin: boolean }[];
  memberPhones: string[];
};

async function main() {
  const me = (process.env.SEED_STAFF_EMAIL || '').trim().toLowerCase();
  if (!me.includes('@')) throw new Error('SEED_STAFF_EMAIL is not set in .env');

  const churches: SeedChurch[] = [
    {
      name: 'Test Church North',
      keyword: 'TESTNORTH',
      seniorPastorName: 'Pastor North',
      staff: [
        { name: 'Dennis (test)', email: me, role: 'senior_pastor', isAccountAdmin: true },
        { name: 'Care Staff North', email: 'care.north@example.com', role: 'care_staff', isAccountAdmin: false },
      ],
      memberPhones: ['+15555550101', '+15555550102'],
    },
    {
      name: 'Test Church South',
      keyword: 'TESTSOUTH',
      seniorPastorName: 'Pastor South',
      staff: [
        { name: 'Pastor South', email: 'pastor.south@example.com', role: 'senior_pastor', isAccountAdmin: true },
        { name: 'Dennis (test, insights)', email: me, role: 'insights_only', isAccountAdmin: false },
      ],
      memberPhones: ['+15555550201', '+15555550202', '+15555550203'],
    },
  ];

  for (const c of churches) {
    const existing = await prisma.church.findUnique({ where: { keyword: c.keyword } });
    const church =
      existing ??
      (await prisma.church.create({
        data: { name: c.name, keyword: c.keyword, seniorPastorName: c.seniorPastorName, status: 'pilot', translation: 'web' },
      }));

    for (const s of c.staff) {
      await prisma.staffUser.upsert({
        where: { churchId_email: { churchId: church.id, email: s.email } },
        update: {},
        create: { churchId: church.id, name: s.name, email: s.email, role: s.role, isAccountAdmin: s.isAccountAdmin },
      });
    }

    for (const phone of c.memberPhones) {
      const phoneHash = 'seed:' + createHash('sha256').update(phone).digest('hex');
      await prisma.member.upsert({
        where: { churchId_phoneHash: { churchId: church.id, phoneHash } },
        update: {},
        create: { churchId: church.id, phoneCiphertext: encryptField(phone), phoneHash, status: 'active' },
      });
    }

    if (!existing) {
      await prisma.auditLog.create({
        data: { churchId: church.id, actorType: 'system', action: 'system.seeded', targetTable: 'churches', targetId: church.id },
      });
    }
    console.log(`${existing ? 'Kept' : 'Created'} ${c.name} (${c.staff.length} staff, ${c.memberPhones.length} members)`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
