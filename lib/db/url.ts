// The app's database connection is built from the owner URL (host, port,
// database, options) with the restricted upheld_app credentials swapped in.
// Only two values are configured, and the app cannot be pointed at the
// owner account by mistake.

import { config } from '@/lib/config';

export const APP_DB_ROLE = 'upheld_app';

export function buildAppDatabaseUrl(ownerUrl: string, appPassword: string): string {
  const url = new URL(ownerUrl);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_OWNER_URL must be a postgresql:// URL');
  }
  url.username = APP_DB_ROLE;
  url.password = appPassword;
  return url.toString();
}

export function appDatabaseUrl(): string {
  return buildAppDatabaseUrl(config.ownerDatabaseUrl(), config.appDbPassword());
}
