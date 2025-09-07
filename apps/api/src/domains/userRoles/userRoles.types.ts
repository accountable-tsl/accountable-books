import { z } from 'zod';
import { dbBaseFields } from '../../core/types/core.js';
import { type RoleKey, type RoleScope } from '../roles/roles.types.js';
import { type Knex } from 'knex';
import {
  createCamelCaseSchema,
  type SnakeToCamelCaseObject,
} from '../../shared/utils/formatting.utils.js';
import { type CompanyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { type CompanyType } from '../companies/companies.types.js';

export const userCompanyRoleBase = z.object({
  user_id: z.uuid(),
  company_id: z.uuid(),
  role_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  created_by_id: z.uuid().nullish(),
});
export const newUserCompanyRoleInput = createCamelCaseSchema(userCompanyRoleBase);
export type NewUserCompanyRoleInput = SnakeToCamelCaseObject<z.infer<typeof newUserCompanyRole>>;

export const newUserCompanyRole = userCompanyRoleBase.extend({
  created_by_id: z.uuid(),
});
export type NewUserCompanyRole = z.infer<typeof newUserCompanyRole>;

export const userCompanyRole = newUserCompanyRole.merge(dbBaseFields);
export type UserCompanyRole = z.infer<typeof userCompanyRole>;

// Base company data fields used across role contexts
export type CompanyBaseFields = {
  companyId: string;
  legalName: string;
  displayName: string | null;
  companyType: CompanyType;
  firmSlug: string | null;
};

// User's role assignment with company details (from DB queries)
export type UserCompanyRoleWithDetails = CompanyBaseFields & {
  userId: string;
  roleId: string;
  roleKey: RoleKey;
  roleName: string;
  roleScope: RoleScope;
  onboardingState: CompanyOnboardingState;
  isDemoCompany: boolean;
};

// Legacy type aliases for backward compatibility (will be removed in next version)
export type RoleQueryResult = UserCompanyRoleWithDetails;
export type UserCompanyRoleAssignmentRes = UserCompanyRoleWithDetails;
export type DemoCompany = CompanyBaseFields;

// GRANT ACCESS TO COMPANY
export type GrantDirectAccess = {
  trx?: Knex.Transaction;
  userId: string;
  companyId: string;
  roleKey: RoleKey;
  grantedBy: string;
};

export type GrantAccessToFirmClient = Omit<GrantDirectAccess, 'companyId'> & {
  clientCompanyId: string;
  firmId: string;
};

export type GrantAccessResponse = {
  action: 'no change' | 'updated' | 'created';
};

export type AccessibleCompanies = {
  id: string; // API field name for companyId
  legalName: string;
  displayName: string | null;
  assignedFirmSlug: string; // API field name for firmSlug
  companyType: CompanyType;
  hasExplicitAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  isDemoCompany: boolean;
  onboardingState: CompanyOnboardingState | null;
};

export type AccessibleCompaniesResponse = {
  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;
  accessibleCompanies: AccessibleCompanies[];
};
