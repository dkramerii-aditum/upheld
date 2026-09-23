// Creates the local development and test databases if they do not exist.
// Connects to the server's built in "postgres" database with the owner user.

import 'dotenv/config';
import pg from 'pg';

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) {
  console.error('DATABASE_OWNER_URL is not set. Run npm run setup:env first.');
  process.exit(1);
}

const admin = new URL(ownerUrl);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });

try {
  await client.connect();
  for (const db of ['upheld_dev', 'upheld_test']) {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (rowCount) {
      console.log(`${db} already exists`);
    } else {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(db)}`);
      console.log(`${db} created`);
    }
  }
} catch (err) {
  console.error('Could not create databases:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
