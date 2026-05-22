import type { AuthCompanyContext } from '@accountable-books/contracts/schema';
import { describe, expect, it } from 'vitest';

import {
  getAssignableWorkspaceRolesForInvite,
  getTeamInviteAssignableWorkspaceRoles,
  pickDefaultInviteRole,
  resolveTeamInviteInviterCeiling,
} from './workspace-invite-roles';

function company(overrides: Partial<AuthCompanyContext>): AuthCompanyContext {
  return {
    id: 'co1',
    legalName: 'Test',
    displayName: null,
    assignedFirmSlug: '',
    companyType: 'business',
    workspaceClass: 'customer',
    hasExplicitAccess: true,
    roleKey: 'client_owner',
    roleScope: 'company',
    isDemoCompany: false,
    isPlatformCompany: false,
    onboardingState: null,
    accessOrigin: 'explicit_company',
    supportAccessLevel: null,
    supportGrantId: null,
    breakGlassSessionId: null,
    ...overrides,
  };
}

describe('resolveTeamInviteInviterCeiling', () => {
  it('maps company client roles', () => {
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'client_owner',
        roleScope: 'company',
        companyType: 'business',
      }),
    ).toBe('owner');
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'client_admin',
        roleScope: 'company',
        companyType: 'business',
      }),
    ).toBe('admin');
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'client_user',
        roleScope: 'company',
        companyType: 'business',
      }),
    ).toBe('viewer');
  });

  it('maps firm org vs firm-on-client ceilings', () => {
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'admin',
        roleScope: 'firm',
        companyType: 'accounting_firm',
      }),
    ).toBe('owner');
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'admin',
        roleScope: 'firm',
        companyType: 'business',
      }),
    ).toBe('admin');
    expect(
      resolveTeamInviteInviterCeiling({
        roleKey: 'staff',
        roleScope: 'firm',
        companyType: 'business',
      }),
    ).toBe('bookkeeper');
  });
});

describe('getAssignableWorkspaceRolesForInvite', () => {
  it('blocks owner invites unless inviter is owner', () => {
    expect(getAssignableWorkspaceRolesForInvite('bookkeeper')).toEqual([
      'bookkeeper',
      'viewer',
    ]);
    expect(getAssignableWorkspaceRolesForInvite('admin')).not.toContain(
      'owner',
    );
    expect(getAssignableWorkspaceRolesForInvite('owner')).toContain('owner');
  });

  it('gives viewers no assignable roles', () => {
    expect(getAssignableWorkspaceRolesForInvite('viewer')).toEqual([]);
  });
});

describe('getTeamInviteAssignableWorkspaceRoles', () => {
  it('returns empty for read-only support grant', () => {
    expect(
      getTeamInviteAssignableWorkspaceRoles({
        user: { isPlatformUser: false },
        companyAccess: company({
          accessOrigin: 'support_grant',
          supportAccessLevel: 'read_only',
          roleKey: 'client_owner',
          roleScope: 'company',
        }),
      }),
    ).toEqual([]);
  });

  it('returns roles for write support grant using role ceiling', () => {
    const roles = getTeamInviteAssignableWorkspaceRoles({
      user: { isPlatformUser: true },
      companyAccess: company({
        accessOrigin: 'support_grant',
        supportAccessLevel: 'company_profile_write',
        roleKey: 'client_admin',
        roleScope: 'company',
      }),
    });
    expect(roles).toContain('admin');
    expect(roles).not.toContain('owner');
  });

  it('blocks demo workspace for non-platform users', () => {
    expect(
      getTeamInviteAssignableWorkspaceRoles({
        user: { isPlatformUser: false },
        companyAccess: company({
          isDemoCompany: true,
          roleKey: 'client_owner',
          roleScope: 'company',
        }),
      }),
    ).toEqual([]);
  });
});

describe('pickDefaultInviteRole', () => {
  it('picks lowest privilege', () => {
    expect(pickDefaultInviteRole(['admin', 'viewer', 'bookkeeper'])).toBe(
      'viewer',
    );
  });
});
