// The only database access path for application code.
//
// Every read or write of church data goes through withChurch(), which opens
// a transaction, sets app.church_id for that transaction only, and runs the
// callback. Row level security in Postgres then limits every query to that
// church. Outside withChurch() the app role sees no church data at all.
//
// Before first use, the connection is checked: it must be the upheld_app
// role, not superuser, not BYPASSRLS, and owner of no tables. If any check
// fails, nothing runs.

import { Prisma, PrismaClient } from '@prisma/client';
import { APP_DB_ROLE, appDatabaseUrl } from './url';

export type ChurchTx = Prisma.TransactionClient;

const globalForDb = globalThis as unknown as {
  upheldAppPrisma?: PrismaClient;
  upheldRoleCheck?: Promise<void>;
};

export function getAppPrisma(): PrismaClient {
  if (!globalForDb.upheldAppPrisma) {
    globalForDb.upheldAppPrisma = new PrismaClient({
      datasourceUrl: appDatabaseUrl(),
      log: ['warn', 'error'],
    });
  }
  return globalForDb.upheldAppPrisma;
}

type RoleRow = { name: string; rolsuper: boolean; rolbypassrls: boolean; owned: bigint };

export function assertRlsRole(): Promise<void> {
  if (!globalForDb.upheldRoleCheck) {
    globalForDb.upheldRoleCheck = (async () => {
      const rows = await getAppPrisma().$queryRaw<RoleRow[]>`
        SELECT current_user::text AS name, r.rolsuper, r.rolbypassrls,
               (SELECT count(*) FROM pg_tables t
                 WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owned
        FROM pg_roles r WHERE r.rolname = current_user`;
      const r = rows[0];
      if (!r || r.name !== APP_DB_ROLE || r.rolsuper || r.rolbypassrls || Number(r.owned) > 0) {
        throw new Error('Database role check failed: the app must connect as upheld_app with row level security enforced.');
      }
    })().catch((err) => {
      globalForDb.upheldRoleCheck = undefined;
      throw err;
    });
  }
  return globalForDb.upheldRoleCheck;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export async function withChurch<T>(churchId: string, fn: (tx: ChurchTx) => Promise<T>): Promise<T> {
  if (!isUuid(churchId)) throw new Error('withChurch requires a valid church id');
  await assertRlsRole();
  return getAppPrisma().$transaction(async (tx) => {
    // The third argument (true) scopes the setting to this transaction.
    await tx.$executeRaw`SELECT set_config('app.church_id', ${churchId}, true)`;
    return fn(tx);
  });
}
