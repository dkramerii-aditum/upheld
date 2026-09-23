import { describe, expect, it } from 'vitest';
import {
  STAFF_ROLES,
  can,
  capabilitiesFor,
  requiresTwoFactor,
  type StaffRole,
} from '@/lib/auth/permissions';

const staff = (role: StaffRole, isAccountAdmin = false) => ({ role, isAccountAdmin });

describe('permission matrix (spec section 9)', () => {
  it('matches the specification table for each role', () => {
    expect(capabilitiesFor(staff('senior_pastor'))).toEqual([
      'care_queue', 'safety_reporting', 'members_table', 'insights', 'content_review',
      'settings_staff', 'plan_billing', 'resume_paused_member',
    ]);
    expect(capabilitiesFor(staff('care_pastor'))).toEqual([
      'care_queue', 'safety_reporting', 'members_table', 'insights', 'content_review', 'resume_paused_member',
    ]);
    expect(capabilitiesFor(staff('care_staff'))).toEqual(['care_queue', 'safety_reporting', 'members_table', 'insights']);
    expect(capabilitiesFor(staff('insights_only'))).toEqual(['insights']);
    expect(capabilitiesFor(staff('founder_support'))).toEqual([
      'safety_escalations_only', 'insights_aggregates_only', 'content_review',
    ]);
  });

  it('gives the account administrator Settings and staff, and Plan and billing (decision log)', () => {
    expect(can(staff('care_pastor', true), 'settings_staff')).toBe(true);
    expect(can(staff('care_pastor', true), 'plan_billing')).toBe(true);
    expect(can(staff('insights_only', true), 'settings_staff')).toBe(true);
    expect(can(staff('care_pastor', false), 'settings_staff')).toBe(false);
  });

  it('never lets founder support see care requests, members, or full safety records', () => {
    for (const cap of ['care_queue', 'members_table', 'safety_reporting', 'insights', 'settings_staff'] as const) {
      expect(can(staff('founder_support'), cap)).toBe(false);
      expect(can(staff('founder_support', true), cap)).toBe(false);
    }
  });

  it('never lets insights only staff see care requests or members', () => {
    expect(can(staff('insights_only'), 'care_queue')).toBe(false);
    expect(can(staff('insights_only'), 'members_table')).toBe(false);
    expect(can(staff('insights_only'), 'safety_reporting')).toBe(false);
  });
});

describe('two factor requirement', () => {
  it('is required for every role that can see care requests', () => {
    for (const role of STAFF_ROLES) {
      if (can(staff(role), 'care_queue')) expect(requiresTwoFactor(staff(role))).toBe(true);
    }
  });

  it('is required for founder support and for account administrators', () => {
    expect(requiresTwoFactor(staff('founder_support'))).toBe(true);
    expect(requiresTwoFactor(staff('insights_only', true))).toBe(true);
  });

  it('is not required for insights only staff who do not administer the account', () => {
    expect(requiresTwoFactor(staff('insights_only'))).toBe(false);
  });
});
