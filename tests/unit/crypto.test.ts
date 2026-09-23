import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptField, encryptField, parseKey } from '@/lib/crypto';
import { buildAppDatabaseUrl } from '@/lib/db/url';

describe('field encryption', () => {
  const key = randomBytes(32);

  it('round trips and never stores plain text', () => {
    const stored = encryptField('+15555550101', key);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('5555550101');
    expect(decryptField(stored, key)).toBe('+15555550101');
  });

  it('uses a fresh IV for every value', () => {
    expect(encryptField('same', key)).not.toBe(encryptField('same', key));
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const stored = encryptField('hello', key);
    const raw = Buffer.from(stored.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decryptField('v1:' + raw.toString('base64'), key)).toThrow();
    expect(() => decryptField(stored, randomBytes(32))).toThrow();
  });

  it('accepts hex or base64 keys of exactly 32 bytes', () => {
    expect(parseKey(key.toString('hex')).equals(key)).toBe(true);
    expect(parseKey(key.toString('base64')).equals(key)).toBe(true);
    expect(() => parseKey('too-short')).toThrow();
  });
});

describe('app database URL', () => {
  it('always connects as upheld_app, never as the owner', () => {
    const url = buildAppDatabaseUrl('postgresql://owner:secret@db.example:5432/upheld?sslmode=require', 'app+pass/word');
    const parsed = new URL(url);
    expect(parsed.username).toBe('upheld_app');
    expect(decodeURIComponent(parsed.password)).toBe('app+pass/word');
    expect(parsed.pathname).toBe('/upheld');
    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(url).not.toContain('owner');
  });
});
