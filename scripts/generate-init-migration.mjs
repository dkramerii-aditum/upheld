// Generates prisma/migrations/20260922000000_init/migration.sql from
// prisma/schema.prisma. Run once in M1, then commit the result.
// The row level security migration (20260922000100) applies after it.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = 'prisma/migrations/20260922000000_init';
const file = `${dir}/migration.sql`;

if (existsSync(file)) {
  console.error(`${file} already exists. Nothing was changed.`);
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const sql = execFileSync(
  npx,
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { encoding: 'utf8', shell: process.platform === 'win32' }
);

if (!sql.includes('CREATE TABLE "churches"')) {
  console.error('Generated SQL did not look right. Nothing was written. Output started with:');
  console.error(sql.slice(0, 500));
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(file, sql);
const tables = (sql.match(/CREATE TABLE/g) || []).length;
console.log(`Wrote ${file} (${tables} tables)`);
