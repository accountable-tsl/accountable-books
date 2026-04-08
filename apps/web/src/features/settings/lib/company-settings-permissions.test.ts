import type { AuthCompanyContext } from '@/modules/auth';
import { describe, expect, it } from 'vitest';

import {
  canEditWorkspaceCompanySettings,
  getWorkspaceCompanySettingsEditDeniedReason,
} from './company-settings-permissions';

function company(overrides: Partial<AuthCompanyContext>): AuthCompanyContext {
  return {
    id: 'co1',
    legalName: 'Test',
    displayName: null,
    assignedFirmSlug: '',
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

describe('company-settings-permissions', () => {
  it('allows demo edit for platform user only', () => {
    expect(
      getWorkspaceCompanySettingsEditDeniedReason(
        { isPlatformUser: true },
        company({ isDemoCompany: true, roleKey: 'client_user' }),
      ),
    ).toBeNull();
    expect(
      getWorkspaceCompanySettingsEditDeniedReason(
        { isPlatformUser: false },
        company({ isDemoCompany: true }),
      ),
    ).toBe('This demo workspace cannot be edited');
  });

  it('allows platform_internal and break_glass', () => {
    expect(
      getWorkspaceCompanySettingsEditDeniedReason(
        { isPlatformUser: false },
        company({ accessOrigin: 'platform_internal' }),
      ),
    ).toBeNull();
    expect(
      getWorkspaceCompanySettingsEditDeniedReason(
        { isPlatformUser: false },
        company({ accessOrigin: 'break_glass', roleScope: 'platform' }),
      ),
    ).toBeNull();
  });

  it('gates support_grant on company_profile_write', () => {
    expect(
      canEditWorkspaceCompanySettings(
        { isPlatformUser: true },
        company({
          accessOrigin: 'support_grant',
          supportAccessLevel: 'company_profile_write',
          roleScope: 'platform',
        }),
      ),
    ).toBe(true);
    expect(
      canEditWorkspaceCompanySettings(
        { isPlatformUser: true },
        company({
          accessOrigin: 'support_grant',
          supportAccessLevel: 'read_only',
        }),
      ),
    ).toBe(false);
  });

  it('allows firm admin and client_owner', () => {
    expect(
      canEditWorkspaceCompanySettings(
        { isPlatformUser: false },
        company({ roleScope: 'firm', roleKey: 'admin' }),
      ),
    ).toBe(true);
    expect(
      canEditWorkspaceCompanySettings(
        { isPlatformUser: false },
        company({ roleScope: 'company', roleKey: 'client_owner' }),
      ),
    ).toBe(true);
  });
});
