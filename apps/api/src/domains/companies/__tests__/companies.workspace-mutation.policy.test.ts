import { describe, expect, it } from 'vitest';

import { getWorkspaceCompanyPatchDeniedReason } from '../companies.workspace-mutation.policy.js';

import type { AccessibleCompanies } from '../../user-roles/user-roles.types.js';

function access(overrides: Partial<AccessibleCompanies>): AccessibleCompanies {
  return {
    id: 'co1',
    legalName: 'Test Co',
    displayName: null,
    assignedFirmSlug: 'firm',
    companyType: 'business',
    hasExplicitAccess: true,
    roleKey: 'client_admin',
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

describe('getWorkspaceCompanyPatchDeniedReason', () => {
  it('allows platform users even on demo companies', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: true },
        access({ isDemoCompany: true, roleKey: 'client_user' }),
      ),
    ).toBeNull();
  });

  it('allows platform internal access origin', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({
          accessOrigin: 'platform_internal',
          roleKey: 'support_admin',
        }),
      ),
    ).toBeNull();
  });

  it('allows break-glass access', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({
          roleScope: 'platform',
          roleKey: 'super_admin',
          accessOrigin: 'break_glass',
        }),
      ),
    ).toBeNull();
  });

  it('denies non-platform PATCH on demo company', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ isDemoCompany: true, roleKey: 'client_admin' }),
      ),
    ).toBe('This demo workspace cannot be edited');
  });

  it('allows company-profile-write support grants and denies read-only grants', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: true },
        access({
          roleScope: 'platform',
          roleKey: 'support_admin',
          accessOrigin: 'support_grant',
          supportAccessLevel: 'company_profile_write',
          supportGrantId: 'grant-1',
        }),
      ),
    ).toBeNull();

    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: true },
        access({
          roleScope: 'platform',
          roleKey: 'support_admin',
          accessOrigin: 'support_grant',
          supportAccessLevel: 'read_only',
          supportGrantId: 'grant-2',
        }),
      ),
    ).toBe('This support session is read-only');
  });

  it('allows firm admin', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ roleScope: 'firm', roleKey: 'admin' }),
      ),
    ).toBeNull();
  });

  it('denies firm staff', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ roleScope: 'firm', roleKey: 'staff' }),
      ),
    ).toBe('Only firm admins can update this workspace');
  });

  it('allows client_owner and client_admin', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ roleScope: 'company', roleKey: 'client_owner' }),
      ),
    ).toBeNull();
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ roleScope: 'company', roleKey: 'client_admin' }),
      ),
    ).toBeNull();
  });

  it('denies client_user', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason(
        { isPlatformUser: false },
        access({ roleScope: 'company', roleKey: 'client_user' }),
      ),
    ).toBe('Only workspace admins can update company settings');
  });

  it('returns message when company access is missing', () => {
    expect(
      getWorkspaceCompanyPatchDeniedReason({ isPlatformUser: false }, null),
    ).toBe('Company context is required');
  });
});
