import { createHash, randomBytes } from 'node:crypto';

// 32 random bytes, URL safe. Used for sign in links and session cookies.
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

// Only this hash is stored; the raw token never touches the database.
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function looksLikeToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
}
