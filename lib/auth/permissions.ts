// Roles and permissions, from Technical Specification section 9, adjusted by
// the decision log: the onboarding point of contact administers the church
// account (Settings and staff, Plan and billing) whatever their role.

export const STAFF_ROLES = [
  'senior_pastor',
  'care_pastor',
  'care_staff',
  'insights_only',
  'founder_support',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const CAPABILITIES = [
  'care_queue',
  'safety_reporting',
  'safety_escalations_only',
  'members_table',
  'insights',
  'insights_aggregates_only',
  'content_review',
  'settings_staff',
  'plan_billing',
  'resume_paused_member',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  senior_pastor: [
    'care_queue', 'safety_reporting', 'members_table', 'insights', 'content_review',
    'settings_staff', 'plan_billing', 'resume_paused_member',
  ],
  care_pastor: [
    'care_queue', 'safety_reporting', 'members_table', 'insights', 'content_review',
    'resume_paused_member',
  ],
  care_staff: ['care_queue', 'safety_reporting', 'members_table', 'insights'],
  insights_only: ['insights'],
  // Never member content. Only with an active church grant (72 hours max).
  founder_support: ['safety_escalations_only', 'insights_aggregates_only', 'content_review'],
};

export const ACCOUNT_ADMIN_CAPABILITIES: readonly Capability[] = ['settings_staff', 'plan_billing'];

export type StaffForPermissions = { role: StaffRole; isAccountAdmin: boolean };

export function capabilitiesFor(staff: StaffForPermissions): Capability[] {
  const caps = new Set<Capability>(ROLE_CAPABILITIES[staff.role]);
  if (staff.isAccountAdmin && staff.role !== 'founder_support') {
    for (const c of ACCOUNT_ADMIN_CAPABILITIES) caps.add(c);
  }
  return CAPABILITIES.filter((c) => caps.has(c));
}

export function can(staff: StaffForPermissions, capability: Capability): boolean {
  return capabilitiesFor(staff).includes(capability);
}

// Care roles see care requests, so two factor is required (spec 11).
// Founder support sees escalation status and account admins control who
// sees care requests, so both are held to the same rule.
const TWO_FACTOR_ROLES: readonly StaffRole[] = ['senior_pastor', 'care_pastor', 'care_staff', 'founder_support'];

export function requiresTwoFactor(staff: StaffForPermissions): boolean {
  return TWO_FACTOR_ROLES.includes(staff.role) || staff.isAccountAdmin;
}

export function auditActorType(role: StaffRole): 'staff' | 'founder_support' {
  return role === 'founder_support' ? 'founder_support' : 'staff';
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  senior_pastor: 'Senior pastor',
  care_pastor: 'Care pastor',
  care_staff: 'Care staff',
  insights_only: 'Insights only',
  founder_support: 'Founder support',
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  care_queue: 'Care queue',
  safety_reporting: 'Safety and reporting',
  safety_escalations_only: 'Safety and reporting (escalations only)',
  members_table: 'Members',
  insights: 'Insights',
  insights_aggregates_only: 'Insights (aggregates only)',
  content_review: 'Content review',
  settings_staff: 'Settings and staff',
  plan_billing: 'Plan and billing',
  resume_paused_member: 'Resume a paused member',
};
