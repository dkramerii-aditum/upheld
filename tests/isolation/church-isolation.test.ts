// Milestone 1 done-when test: two churches exist and cannot see each
// other's data. Runs against the upheld_test database.
//
// Setup uses the owner connection (test only). Every assertion about what a
// church can see uses the app connection, as the restricted upheld_app role,
// exactly as the running application does.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createOwnerPrisma } from '@/lib/db/owner';
import { assertRlsRole, getAppPrisma, withChurch } from '@/lib/db';
import { writeAudit } from '@/lib/audit';

const owner = createOwnerPrisma();

type Fixture = {
  churchId: string;
  staffId: string;
  memberId: string;
  messageId: string;
  careRequestId: string;
  sessionHash: string;
};

let A: Fixture;
let B: Fixture;

async function makeChurch(label: string): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const church = await owner.church.create({
    data: { name: `Isolation ${label} ${suffix}`, keyword: `ISO${label}${suffix}`, status: 'pilot' },
  });
  const staff = await owner.staffUser.create({
    data: { churchId: church.id, name: `Staff ${label}`, email: `staff.${label.toLowerCase()}.${suffix.toLowerCase()}@example.com`, role: 'care_pastor' },
  });
  const member = await owner.member.create({
    data: { churchId: church.id, phoneCiphertext: 'v1:placeholder', phoneHash: `test:${randomUUID()}`, status: 'active' },
  });
  const message = await owner.message.create({
    data: { churchId: church.id, memberId: member.id, direction: 'inbound', type: 'reply', bodyCiphertext: 'v1:placeholder', deliveryStatus: 'received' },
  });
  const care = await owner.careRequest.create({
    data: { churchId: church.id, memberId: member.id, consentBasis: 'care_request', sharedTextCiphertext: 'v1:placeholder' },
  });
  const sessionHash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  await owner.staffSession.create({
    data: { churchId: church.id, staffUserId: staff.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3600_000) },
  });
  await owner.auditLog.create({
    data: { churchId: church.id, actorType: 'system', action: 'system.seeded', targetTable: 'churches', targetId: church.id },
  });
  return { churchId: church.id, staffId: staff.id, memberId: member.id, messageId: message.id, careRequestId: care.id, sessionHash };
}

beforeAll(async () => {
  A = await makeChurch('A');
  B = await makeChurch('B');
});

afterAll(async () => {
  await owner.$disconnect();
  await getAppPrisma().$disconnect();
});

describe('database role', () => {
  it('the app connects as upheld_app, which cannot bypass row level security', async () => {
    await expect(assertRlsRole()).resolves.toBeUndefined();
    const rows = await getAppPrisma().$queryRaw<{ name: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT current_user::text AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]).toEqual({ name: 'upheld_app', rolsuper: false, rolbypassrls: false });
  });

  it('every church scoped table has row level security enabled and a policy', async () => {
    const tables = await owner.$queryRaw<{ table_name: string; has_church_id: boolean; rls: boolean; policies: bigint }[]>`
      SELECT c.relname::text AS table_name,
             EXISTS (SELECT 1 FROM information_schema.columns col
                     WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'church_id') AS has_church_id,
             c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`;

    expect(tables.length).toBeGreaterThan(20);
    for (const t of tables) {
      // Every table except churches carries church_id (spec section 5).
      if (t.table_name !== 'churches') expect({ table: t.table_name, church_id: t.has_church_id }).toEqual({ table: t.table_name, church_id: true });
      expect({ table: t.table_name, rls: t.rls }).toEqual({ table: t.table_name, rls: true });
      expect(Number(t.policies)).toBeGreaterThan(0);
    }
  });
});

describe('reading', () => {
  it('each church sees exactly one church: itself', async () => {
    const seenByA = await withChurch(A.churchId, (tx) => tx.church.findMany({ select: { id: true } }));
    const seenByB = await withChurch(B.churchId, (tx) => tx.church.findMany({ select: { id: true } }));
    expect(seenByA).toEqual([{ id: A.churchId }]);
    expect(seenByB).toEqual([{ id: B.churchId }]);
  });

  it('church A cannot read any of church B\'s rows, by listing or by id', async () => {
    const result = await withChurch(A.churchId, async (tx) => ({
      staff: await tx.staffUser.findUnique({ where: { id: B.staffId } }),
      member: await tx.member.findUnique({ where: { id: B.memberId } }),
      message: await tx.message.findUnique({ where: { id: B.messageId } }),
      care: await tx.careRequest.findUnique({ where: { id: B.careRequestId } }),
      session: await tx.staffSession.findUnique({ where: { tokenHash: B.sessionHash } }),
      bStaffListed: await tx.staffUser.count({ where: { churchId: B.churchId } }),
      bAuditListed: await tx.auditLog.count({ where: { churchId: B.churchId } }),
      bMembersListed: await tx.member.count({ where: { churchId: B.churchId } }),
      allStaffChurches: (await tx.staffUser.findMany({ select: { churchId: true } })).map((s) => s.churchId),
      allAuditChurches: (await tx.auditLog.findMany({ select: { churchId: true } })).map((a) => a.churchId),
    }));
    expect(result.staff).toBeNull();
    expect(result.member).toBeNull();
    expect(result.message).toBeNull();
    expect(result.care).toBeNull();
    expect(result.session).toBeNull();
    expect(result.bStaffListed).toBe(0);
    expect(result.bAuditListed).toBe(0);
    expect(result.bMembersListed).toBe(0);
    expect(new Set(result.allStaffChurches)).toEqual(new Set([A.churchId]));
    expect(new Set(result.allAuditChurches)).toEqual(new Set([A.churchId]));
  });

  it('church B cannot read church A\'s rows either', async () => {
    const result = await withChurch(B.churchId, async (tx) => ({
      staff: await tx.staffUser.findUnique({ where: { id: A.staffId } }),
      member: await tx.member.findUnique({ where: { id: A.memberId } }),
      care: await tx.careRequest.findUnique({ where: { id: A.careRequestId } }),
    }));
    expect(result).toEqual({ staff: null, member: null, care: null });
  });

  it('with no church selected, the app sees nothing at all', async () => {
    const app = getAppPrisma();
    expect(await app.church.count()).toBe(0);
    expect(await app.staffUser.count()).toBe(0);
    expect(await app.member.count()).toBe(0);
    expect(await app.auditLog.count()).toBe(0);
  });

  it('the church setting does not leak past the end of a transaction', async () => {
    await withChurch(A.churchId, (tx) => tx.staffUser.count());
    const counts = await Promise.all(Array.from({ length: 5 }, () => getAppPrisma().staffUser.count()));
    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('writing', () => {
  it('church A cannot create a row that belongs to church B', async () => {
    await expect(
      withChurch(A.churchId, (tx) =>
        tx.staffUser.create({
          data: { churchId: B.churchId, name: 'Intruder', email: `intruder.${randomUUID().slice(0, 8)}@example.com`, role: 'care_staff' },
        })
      )
    ).rejects.toThrow();
  });

  it('church A cannot update or delete church B\'s rows', async () => {
    const outcome = await withChurch(A.churchId, async (tx) => ({
      updated: (await tx.staffUser.updateMany({ where: { id: B.staffId }, data: { name: 'Changed by A' } })).count,
      deleted: (await tx.careRequest.deleteMany({ where: { id: B.careRequestId } })).count,
    }));
    expect(outcome).toEqual({ updated: 0, deleted: 0 });
    const staff = await owner.staffUser.findUnique({ where: { id: B.staffId } });
    const care = await owner.careRequest.findUnique({ where: { id: B.careRequestId } });
    expect(staff?.name).toBe('Staff B');
    expect(care).not.toBeNull();
  });

  it('church A cannot move its own row into church B', async () => {
    await expect(
      withChurch(A.churchId, (tx) => tx.staffUser.update({ where: { id: A.staffId }, data: { churchId: B.churchId } }))
    ).rejects.toThrow();
  });

  it('church A cannot point its own records at church B\'s member or staff', async () => {
    await expect(
      withChurch(A.churchId, (tx) =>
        tx.careRequest.create({ data: { churchId: A.churchId, memberId: B.memberId, consentBasis: 'care_request' } })
      )
    ).rejects.toThrow();
    await expect(
      withChurch(A.churchId, (tx) =>
        tx.careRequest.update({ where: { id: A.careRequestId }, data: { assignedStaffId: B.staffId } })
      )
    ).rejects.toThrow();
  });

  it('cross church references are rejected even for the owner connection', async () => {
    await expect(
      owner.careRequest.create({ data: { churchId: A.churchId, memberId: B.memberId, consentBasis: 'care_request' } })
    ).rejects.toThrow();
  });

  it('church A cannot write an audit entry into church B\'s log', async () => {
    await expect(
      withChurch(A.churchId, (tx) => writeAudit(tx, { churchId: B.churchId, actorType: 'system', action: 'system.seeded' }))
    ).rejects.toThrow();
  });
});

describe('audit log', () => {
  it('the audit writer records entries for the current church', async () => {
    await withChurch(A.churchId, (tx) =>
      writeAudit(tx, {
        churchId: A.churchId, actorType: 'staff', actorStaffId: A.staffId, action: 'auth.session_started',
        targetTable: 'staff_users', targetId: A.staffId, ipAddress: '203.0.113.7',
      })
    );
    const entry = await owner.auditLog.findFirst({
      where: { churchId: A.churchId, action: 'auth.session_started' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.actorStaffId).toBe(A.staffId);
    expect(entry?.ipAddress).toBe('203.0.113.7');
  });

  it('is append only for the app role', async () => {
    await expect(
      withChurch(A.churchId, (tx) => tx.auditLog.updateMany({ where: {}, data: { action: 'system.seeded' } }))
    ).rejects.toThrow();
    await expect(withChurch(A.churchId, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow();
  });

  it('is append only even for the owner connection', async () => {
    await expect(owner.auditLog.updateMany({ where: { churchId: A.churchId }, data: { detail: 'changed' } })).rejects.toThrow();
    await expect(owner.auditLog.deleteMany({ where: { churchId: A.churchId } })).rejects.toThrow();
    await expect(owner.$executeRawUnsafe('TRUNCATE audit_log')).rejects.toThrow();
  });

  it('rejects free text detail at the database level too', async () => {
    await expect(
      owner.auditLog.create({ data: { churchId: A.churchId, actorType: 'system', action: 'system.seeded', detail: 'Member said something private' } })
    ).rejects.toThrow();
  });
});

describe('sign in lookups', () => {
  it('only return the church for an exact session hash, and nothing else', async () => {
    const app = getAppPrisma();
    const hit = await app.$queryRaw<{ church_id: string | null }[]>`SELECT auth_session_church(${A.sessionHash})::text AS church_id`;
    const miss = await app.$queryRaw<{ church_id: string | null }[]>`SELECT auth_session_church(${'not-a-real-hash'})::text AS church_id`;
    expect(hit[0].church_id).toBe(A.churchId);
    expect(miss[0].church_id).toBeNull();
  });
});

describe('data rules', () => {
  it('theme counts below the anonymity threshold of five can never be written', async () => {
    await expect(
      owner.themeCount.create({ data: { churchId: A.churchId, month: new Date('2026-09-01'), theme: 'grief', count: 4 } })
    ).rejects.toThrow();
  });

  it('care request consent cannot be turned off', async () => {
    await expect(
      owner.consent.create({ data: { churchId: A.churchId, memberId: A.memberId, careRequests: false } })
    ).rejects.toThrow();
  });

  it('founder support grants cannot exceed 72 hours', async () => {
    const support = await owner.staffUser.create({
      data: { churchId: A.churchId, name: 'Founder support', email: `support.${randomUUID().slice(0, 8)}@example.com`, role: 'founder_support' },
    });
    const now = new Date();
    await expect(
      owner.supportAccessGrant.create({
        data: {
          churchId: A.churchId, grantedByStaffId: A.staffId, supportStaffUserId: support.id,
          grantedAt: now, expiresAt: new Date(now.getTime() + 73 * 3600_000),
        },
      })
    ).rejects.toThrow();
  });
});
