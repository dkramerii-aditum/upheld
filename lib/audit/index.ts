// Audit log writer.
//
// Append only (enforced by a database trigger for every role). Never stores
// message content: actions come from a fixed list, detail must be a short
// code, and there is no free text field. The database repeats both checks.
//
// Always call inside withChurch(); row level security rejects an entry whose
// church does not match the transaction's church.

import type { ChurchTx } from '@/lib/db';

export const AUDIT_ACTIONS = [
  // Staff sign in (M1)
  'auth.link_requested',
  'auth.link_used',
  'auth.session_started',
  'auth.session_ended',
  'auth.session_timed_out',
  'auth.two_factor_enrolled',
  'auth.two_factor_passed',
  'auth.two_factor_failed',
  'auth.two_factor_locked',
  'auth.access_denied',
  // Staff and support administration
  'staff.created',
  'staff.role_changed',
  'staff.deactivated',
  'support.grant_created',
  'support.grant_revoked',
  // System
  'system.seeded',
  // Reserved for later milestones. Listed now so the vocabulary is reviewed
  // in one place.
  'care_request.viewed',
  'care_request.assigned',
  'care_request.closed',
  'escalation.step_recorded',
  'escalation.acknowledged',
  'escalation.resolved',
  'member.resumed',
  'consent.changed',
  'consent.share_decision',
  'audit.exported',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TABLES = [
  'churches', 'staff_users', 'staff_sessions', 'support_access_grants', 'members',
  'consents', 'care_requests', 'safety_flags', 'escalations', 'audit_log',
] as const;

export type AuditTargetTable = (typeof AUDIT_TARGET_TABLES)[number];

export type AuditEntry = {
  churchId: string;
  actorType: 'staff' | 'founder_support' | 'system';
  actorStaffId?: string | null;
  action: AuditAction;
  targetTable?: AuditTargetTable | null;
  targetId?: string | null;
  // A short code such as "role:care_staff" or "reason:idle". Never text
  // from a member, never an email body, never a phone number.
  detail?: string | null;
  ipAddress?: string | null;
};

const DETAIL_RE = /^[a-z0-9_.:-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAuditEntry(entry: AuditEntry): void {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(entry.action)) {
    throw new Error(`Unknown audit action: ${String(entry.action)}`);
  }
  if (!UUID_RE.test(entry.churchId)) throw new Error('Audit entry needs a church id');
  if (entry.actorType !== 'system' && !entry.actorStaffId) {
    throw new Error('Staff and founder support audit entries need an actor');
  }
  if (entry.actorStaffId && !UUID_RE.test(entry.actorStaffId)) throw new Error('Invalid actor id');
  if (entry.targetTable && !(AUDIT_TARGET_TABLES as readonly string[]).includes(entry.targetTable)) {
    throw new Error('Unknown audit target table');
  }
  if (entry.targetId && !UUID_RE.test(entry.targetId)) throw new Error('Invalid audit target id');
  if (entry.detail != null && !DETAIL_RE.test(entry.detail)) {
    throw new Error('Audit detail must be a short code (lower case letters, digits, and _ . : -)');
  }
}

export async function writeAudit(tx: ChurchTx, entry: AuditEntry): Promise<void> {
  validateAuditEntry(entry);
  await tx.auditLog.create({
    data: {
      churchId: entry.churchId,
      actorType: entry.actorType,
      actorStaffId: entry.actorStaffId ?? null,
      action: entry.action,
      targetTable: entry.targetTable ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
