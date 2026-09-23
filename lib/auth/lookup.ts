// Calls to the three SECURITY DEFINER functions that may read across
// churches during sign in. Each returns only ids needed to open a church
// scoped transaction. See the rls_and_integrity migration.

import { assertRlsRole, getAppPrisma } from '@/lib/db';

export type StaffMatch = { staffId: string; churchId: string; churchName: string };

export async function findActiveStaffByEmail(email: string): Promise<StaffMatch[]> {
  await assertRlsRole();
  const rows = await getAppPrisma().$queryRaw<{ staff_id: string; church_id: string; church_name: string }[]>`
    SELECT staff_id::text AS staff_id, church_id::text AS church_id, church_name
    FROM auth_find_active_staff_by_email(${email})`;
  return rows.map((r) => ({ staffId: r.staff_id, churchId: r.church_id, churchName: r.church_name }));
}

export async function churchForLoginToken(tokenHash: string): Promise<string | null> {
  await assertRlsRole();
  const rows = await getAppPrisma().$queryRaw<{ church_id: string | null }[]>`
    SELECT auth_login_token_church(${tokenHash})::text AS church_id`;
  return rows[0]?.church_id ?? null;
}

export async function churchForSession(tokenHash: string): Promise<string | null> {
  await assertRlsRole();
  const rows = await getAppPrisma().$queryRaw<{ church_id: string | null }[]>`
    SELECT auth_session_church(${tokenHash})::text AS church_id`;
  return rows[0]?.church_id ?? null;
}
