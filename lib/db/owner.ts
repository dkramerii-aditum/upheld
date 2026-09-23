// OWNER CONNECTION. Bypasses row level security.
//
// Only for scripts/ and tests/ (seeding, reports, test setup). Application
// code under app/ and lib/ must never import this file; a test enforces that.

import { PrismaClient } from '@prisma/client';
import { config } from '@/lib/config';

export function createOwnerPrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: config.ownerDatabaseUrl(), log: ['warn', 'error'] });
}
