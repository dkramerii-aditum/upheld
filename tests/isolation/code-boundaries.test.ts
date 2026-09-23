// Structural guards that keep church isolation from being bypassed in code.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const appCode = [...sourceFiles('app'), ...sourceFiles('lib')];

describe('code boundaries', () => {
  it('application code never imports the owner connection', () => {
    const offenders = appCode
      .filter((f) => !f.replace(/\\/g, '/').endsWith('lib/db/owner.ts'))
      .filter((f) => /db\/owner/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only lib/db and lib/db/owner construct a database client', () => {
    const allowed = ['lib/db/index.ts', 'lib/db/owner.ts'];
    const offenders = appCode
      .filter((f) => !allowed.includes(f.replace(/\\/g, '/')))
      .filter((f) => /new\s+PrismaClient\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only lib/db sets the church context', () => {
    const offenders = appCode
      .filter((f) => f.replace(/\\/g, '/') !== 'lib/db/index.ts')
      .filter((f) => /app\.church_id/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
