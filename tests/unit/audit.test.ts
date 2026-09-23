import { describe, expect, it } from 'vitest';
import { validateAuditEntry, writeAudit, type AuditEntry } from '@/lib/audit';

const church = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const base: AuditEntry = { churchId: church, actorType: 'staff', actorStaffId: actor, action: 'auth.link_used' };

describe('audit log writer', () => {
  it('accepts a well formed entry', () => {
    expect(() => validateAuditEntry(base)).not.toThrow();
    expect(() => validateAuditEntry({ ...base, detail: 'reason:idle' })).not.toThrow();
  });

  it('rejects actions outside the fixed vocabulary', () => {
    expect(() => validateAuditEntry({ ...base, action: 'anything.goes' as never })).toThrow();
  });

  it('rejects free text in detail, so message content can never be stored', () => {
    expect(() => validateAuditEntry({ ...base, detail: 'I am struggling this week' })).toThrow();
    expect(() => validateAuditEntry({ ...base, detail: '+15555550101' })).toThrow();
    expect(() => validateAuditEntry({ ...base, detail: 'x'.repeat(65) })).toThrow();
  });

  it('requires an actor for staff and founder support entries', () => {
    expect(() => validateAuditEntry({ ...base, actorStaffId: null })).toThrow();
    expect(() => validateAuditEntry({ ...base, actorType: 'system', actorStaffId: null })).not.toThrow();
  });

  it('writes nothing when validation fails', async () => {
    let writes = 0;
    const fakeTx = { auditLog: { create: async () => { writes += 1; } } } as never;
    await expect(writeAudit(fakeTx, { ...base, detail: 'free text here' })).rejects.toThrow();
    expect(writes).toBe(0);
    await writeAudit(fakeTx, base);
    expect(writes).toBe(1);
  });
});
