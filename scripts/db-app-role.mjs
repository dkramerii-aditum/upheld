// Creates or updates the restricted upheld_app login role.
// Safe to run repeatedly. Runs before migrations locally and on Render.
//
// upheld_app is never superuser, never BYPASSRLS, and owns no tables, so row
// level security always applies to it.

import 'dotenv/config';
import pg from 'pg';

const ownerUrl = process.env.DATABASE_OWNER_URL;
const password = process.env.APP_DB_PASSWORD;
if (!ownerUrl || !password) {
  console.error('DATABASE_OWNER_URL and APP_DB_PASSWORD must be set.');
  process.exit(1);
}
if (password.length < 24) {
  console.error('APP_DB_PASSWORD must be at least 24 characters.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: ownerUrl });
try {
  await client.connect();
  const { rows: me } = await client.query('SELECT current_user AS name');
  if (me[0].name === 'upheld_app') {
    throw new Error('DATABASE_OWNER_URL must use the owner account, not upheld_app.');
  }
  const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'upheld_app'");
  const pw = client.escapeLiteral(password);
  const attrs = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT';
  if (rowCount) {
    await client.query(`ALTER ROLE upheld_app WITH ${attrs} PASSWORD ${pw}`);
    console.log('upheld_app role updated');
  } else {
    await client.query(`CREATE ROLE upheld_app WITH ${attrs} PASSWORD ${pw}`);
    console.log('upheld_app role created');
  }
  const { rows: db } = await client.query('SELECT current_database() AS name');
  await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(db[0].name)} TO upheld_app`);

  const { rows } = await client.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'upheld_app'"
  );
  if (rows[0].rolsuper || rows[0].rolbypassrls) {
    throw new Error('upheld_app must not be superuser or BYPASSRLS.');
  }
  console.log(`upheld_app can connect to ${db[0].name}; row level security applies to it`);
} catch (err) {
  console.error('db-app-role failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
