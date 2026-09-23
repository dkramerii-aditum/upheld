// Field level encryption: AES-256-GCM with a random 12 byte IV per value.
// Stored format: "v1:" + base64(iv | auth tag | ciphertext).
// The version prefix allows key rotation later without a schema change.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '@/lib/config';

const PREFIX = 'v1:';

export function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
  return key;
}

let cachedKey: Buffer | undefined;
function key(): Buffer {
  if (!cachedKey) cachedKey = parseKey(config.fieldEncryptionKey());
  return cachedKey;
}

export function encryptField(plaintext: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString('base64');
}

export function decryptField(stored: string, k: Buffer = key()): string {
  if (!stored.startsWith(PREFIX)) throw new Error('Unknown ciphertext version');
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (raw.length < 28) throw new Error('Ciphertext too short');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
