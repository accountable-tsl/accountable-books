/**
 * Client-side invite-role rules for workspace team settings.
 *
 * Maps session `roleKey` + `roleScope` + `companyType` to a workspace ceiling, then
 * offers only roles at or below that ceiling (owner assignable only by owners).
 * Firm staff acting on a **client** company get a lower ceiling than the same keys
 * on the **firm org** (`accounting_firm`) so they cannot mint workspace owners on a
 * client book. Server must still enforce; this module is UX + defense in depth.
 */
import type {
  AuthCompanyContext,
  AuthUserContext,
  CompanyType,
  RoleKey,
  RoleScope,
  WorkspaceTeamRole,
} from '@accountable-books/contracts/schema';
import { workspaceTeamRoleSchema } from '@accountable-books/contracts/schema';

const WORKSPACE_RANK: Record<WorkspaceTeamRole, number> = {
  viewer: 0,
  bookkeeper: 1,
  accountant: 2,
  admin: 3,
  owner: 4,
};

const WORKSPACE_ROLES_ORDER: readonly WorkspaceTeamRole[] =
  workspaceTeamRoleSchema.options;

export function resolveTeamInviteInviterCeiling(params: {
  roleKey: RoleKey | null | undefined;
  roleScope: RoleScope | null | undefined;
  companyType: CompanyType | null | undefined;
}): WorkspaceTeamRole | null {
  const { roleKey, roleScope, companyType } = params;

  if (!roleKey || !roleScope) {
    return null;
  }

  if (roleScope === 'company') {
    if (roleKey === 'client_owner') return 'owner';
    if (roleKey === 'client_admin') return 'admin';
    if (roleKey === 'client_user') return 'viewer';
    return null;
  }

  if (roleScope === 'firm') {
    const isFirmOrg = companyType === 'accounting_firm';

    if (isFirmOrg) {
      if (roleKey === 'admin') return 'owner';
      if (roleKey === 'manager') return 'admin';
      if (roleKey === 'staff') return 'bookkeeper';
      return null;
    }

    if (roleKey === 'admin') return 'admin';
    if (roleKey === 'manager') return 'accountant';
    if (roleKey === 'staff') return 'bookkeeper';
    return null;
  }

  if (roleScope === 'platform') {
    if (roleKey === 'super_admin' || roleKey === 'support_admin')
      return 'owner';
    if (roleKey === 'support_agent') return 'accountant';
    return null;
  }

  return null;
}

/**
 * Roles the inviter may assign on an invite, client-side preview of server rules.
 * Only {@link WorkspaceTeamRole} values; server remains authoritative.
 */
export function getAssignableWorkspaceRolesForInvite(
  inviterCeiling: WorkspaceTeamRole,
): WorkspaceTeamRole[] {
  if (inviterCeiling === 'viewer') {
    return [];
  }

  return WORKSPACE_ROLES_ORDER.filter((role) => {
    if (WORKSPACE_RANK[role] > WORKSPACE_RANK[inviterCeiling]) {
      return false;
    }
    if (role === 'owner' && inviterCeiling !== 'owner') {
      return false;
    }
    return true;
  });
}

export type TeamInviteCompanyAccess = Pick<
  AuthCompanyContext,
  | 'roleKey'
  | 'roleScope'
  | 'companyType'
  | 'isDemoCompany'
  | 'accessOrigin'
  | 'supportAccessLevel'
>;

/**
 * Workspace roles that may appear in the invite-role control for the current session row.
 * UX only; API must still enforce.
 */
export function getTeamInviteAssignableWorkspaceRoles(params: {
  user: Pick<AuthUserContext, 'isPlatformUser'> | null | undefined;
  companyAccess: TeamInviteCompanyAccess | null | undefined;
}): WorkspaceTeamRole[] {
  const { user, companyAccess } = params;

  if (!companyAccess) {
    return [];
  }

  if (companyAccess.isDemoCompany && user?.isPlatformUser !== true) {
    return [];
  }

  if (companyAccess.accessOrigin === 'support_grant') {
    if (companyAccess.supportAccessLevel !== 'company_profile_write') {
      return [];
    }
  }

  const ceiling = resolveTeamInviteInviterCeiling({
    roleKey: companyAccess.roleKey,
    roleScope: companyAccess.roleScope,
    companyType: companyAccess.companyType,
  });

  if (ceiling == null) {
    return [];
  }

  return getAssignableWorkspaceRolesForInvite(ceiling);
}

export function pickDefaultInviteRole(
  assignable: readonly WorkspaceTeamRole[],
): WorkspaceTeamRole {
  if (assignable.length === 0) {
    return 'viewer';
  }
  return [...assignable].sort(
    (a, b) => WORKSPACE_RANK[a] - WORKSPACE_RANK[b],
  )[0]!;
}
