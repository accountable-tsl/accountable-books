import type { AuthCompanyContext, AuthUserContext } from '@/modules/auth';

// UX only; server enforces PATCH rules (see getWorkspaceCompanyPatchDeniedReason).
export function getWorkspaceCompanySettingsEditDeniedReason(
  user: Pick<AuthUserContext, 'isPlatformUser'> | null | undefined,
  companyAccess: AuthCompanyContext | null | undefined,
): string | null {
  if (!companyAccess) {
    return 'Company context is required';
  }

  if (companyAccess.isDemoCompany) {
    return user?.isPlatformUser === true
      ? null
      : 'This demo workspace cannot be edited';
  }

  if (companyAccess.accessOrigin === 'platform_internal') {
    return null;
  }

  if (companyAccess.accessOrigin === 'break_glass') {
    return null;
  }

  if (companyAccess.accessOrigin === 'support_grant') {
    return companyAccess.supportAccessLevel === 'company_profile_write'
      ? null
      : 'This support session is read-only';
  }

  const { roleScope, roleKey } = companyAccess;

  if (roleScope === 'firm') {
    return roleKey === 'admin'
      ? null
      : 'Only firm admins can update this workspace';
  }

  if (roleScope === 'company') {
    return roleKey === 'client_owner' || roleKey === 'client_admin'
      ? null
      : 'Only workspace admins can update company settings';
  }

  return 'You do not have permission to update company settings';
}

export function canEditWorkspaceCompanySettings(
  user: Pick<AuthUserContext, 'isPlatformUser'> | null | undefined,
  companyAccess: AuthCompanyContext | null | undefined,
): boolean {
  return (
    getWorkspaceCompanySettingsEditDeniedReason(user, companyAccess) === null
  );
}
