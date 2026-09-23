// Writes .env and .env.test with fresh secrets. No editor needed.
//
// Usage:
//   npm run setup:env -- --pg-user NAME [--pg-password PASS] --email YOU@EXAMPLE.COM
// Optional: --pg-host localhost --pg-port 5432 --force
//
// Refuses to overwrite existing files unless --force is given, because
// replacing FIELD_ENCRYPTION_KEY makes existing encrypted data unreadable.

import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return '';
  return v;
}

const force = process.argv.includes('--force');
const pgUser = arg('pg-user');
const pgPassword = arg('pg-password', '');
const pgHost = arg('pg-host', 'localhost');
const pgPort = arg('pg-port', '5432');
const email = (arg('email', '') || '').trim().toLowerCase();

if (!pgUser) {
  console.error('Missing --pg-user. Example: npm run setup:env -- --pg-user postgres --pg-password secret --email you@example.com');
  process.exit(1);
}
if (!email || !email.includes('@')) {
  console.error('Missing or invalid --email (the address you will sign in with during development).');
  process.exit(1);
}
for (const f of ['.env', '.env.test']) {
  if (existsSync(f) && !force) {
    console.error(`${f} already exists. Nothing was changed. Add --force only if you are sure (it replaces the encryption key).`);
    process.exit(1);
  }
}

const appDbPassword = randomBytes(24).toString('hex');
const fieldKey = randomBytes(32).toString('hex');
const auth = pgPassword
  ? `${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPassword)}`
  : encodeURIComponent(pgUser);
const url = (db) => `postgresql://${auth}@${pgHost}:${pgPort}/${db}`;

function envFile(db, extra) {
  return [
    '# Written by npm run setup:env. Never commit this file.',
    `DATABASE_OWNER_URL="${url(db)}"`,
    `APP_DB_PASSWORD="${appDbPassword}"`,
    `FIELD_ENCRYPTION_KEY="${fieldKey}"`,
    'APP_BASE_URL="http://localhost:3000"',
    'EMAIL_PROVIDER="console"',
    'EMAIL_FROM=""',
    'RESEND_API_KEY=""',
    'SESSION_IDLE_MINUTES="30"',
    'SESSION_MAX_HOURS="12"',
    'ANTHROPIC_API_KEY=""',
    ...extra,
    '',
  ].join('\n');
}

writeFileSync('.env', envFile('upheld_dev', [`SEED_STAFF_EMAIL="${email}"`]), { mode: 0o600 });
writeFileSync('.env.test', envFile('upheld_test', ['SEED_STAFF_EMAIL=""']), { mode: 0o600 });

console.log('Wrote .env (database upheld_dev) and .env.test (database upheld_test).');
console.log(`Postgres user: ${pgUser} at ${pgHost}:${pgPort}`);
console.log(`Sign in email: ${email}`);
console.log('Secrets were generated and are not shown.');
