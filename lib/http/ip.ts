// Client IP for the audit log. Render sets X-Forwarded-For; the first entry
// is the client. Anything that is not a valid IP is dropped.

import { isIP } from 'node:net';

export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const candidate = (forwarded ? forwarded.split(',')[0] : headers.get('x-real-ip') || '').trim();
  return isIP(candidate) ? candidate : null;
}
