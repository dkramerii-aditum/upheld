// Reads configuration from environment variables. Values are read when
// needed, not at import time, so builds do not require secrets.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

function intInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export const config = {
  ownerDatabaseUrl: () => required('DATABASE_OWNER_URL'),
  appDbPassword: () => required('APP_DB_PASSWORD'),
  fieldEncryptionKey: () => required('FIELD_ENCRYPTION_KEY'),
  appBaseUrl: () => required('APP_BASE_URL').replace(/\/+$/, ''),
  emailProvider: (): 'console' | 'resend' | 'disabled' => {
    const v = (process.env.EMAIL_PROVIDER || 'disabled').toLowerCase();
    if (v === 'console' || v === 'resend' || v === 'disabled') return v;
    throw new Error('EMAIL_PROVIDER must be console, resend, or disabled');
  },
  emailFrom: () => required('EMAIL_FROM'),
  resendApiKey: () => required('RESEND_API_KEY'),
  // Idle timeout can be shortened but never set above 60 minutes.
  sessionIdleMinutes: () => intInRange('SESSION_IDLE_MINUTES', 30, 5, 60),
  sessionMaxHours: () => intInRange('SESSION_MAX_HOURS', 12, 1, 24),
  isProduction: () => process.env.NODE_ENV === 'production',
};

export const LOGIN_LINK_MINUTES = 15;
export const LOGIN_LINKS_PER_HOUR = 5;
export const TWO_FACTOR_MAX_FAILURES = 5;
