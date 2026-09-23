// Tests always use .env.test and refuse to run against a database whose
// name does not end in _test.

import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

if (existsSync('.env.test')) {
  dotenv.config({ path: '.env.test', override: true });
}

const url = process.env.DATABASE_OWNER_URL;
if (url) {
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Tests refuse to run against "${dbName}". Use a database ending in _test.`);
  }
}
