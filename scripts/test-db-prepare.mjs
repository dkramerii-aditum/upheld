// Resets the TEST database and applies all migrations. Refuses to touch any
// database whose name does not end in _test, so it can never wipe upheld_dev.

import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!existsSync('.env.test')) {
  console.error('.env.test is missing. Run npm run setup:env first.');
  process.exit(1);
}
dotenv.config({ path: '.env.test', override: true });

const url = process.env.DATABASE_OWNER_URL || '';
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to reset "${dbName}": test database names must end in _test.`);
  process.exit(1);
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });

run(process.execPath, ['scripts/db-app-role.mjs']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate',
]);
console.log(`Test database ${dbName} is reset and migrated.`);
