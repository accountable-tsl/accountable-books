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
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  role_id: z.string().uuid(),
  updated_by_id: z.string().uuid().nullish(),
  created_by_id: z.string().uuid().nullish(),
});
export const newUserCompanyRoleInput = createCamelCaseSchema(userCompanyRoleBase);
export type NewUserCompanyRoleInput = SnakeToCamelCaseObject<z.infer<typeof newUserCompanyRole>>;

export const newUserCompanyRole = userCompanyRoleBase.extend({
  created_by_id: z.string().uuid(),
});
export type NewUserCompanyRole = z.infer<typeof newUserCompanyRole>;

export const userCompanyRole = newUserCompanyRole.merge(dbBaseFields);
export type UserCompanyRole = z.infer<typeof userCompanyRole>;

export type UserCompanyRoleAssignmentRes = {
  userId: string;
  companyId: string;
  firmSlug: string;
  roleId: string;
  roleKey: RoleKey;
  roleName: string;
  roleScope: RoleScope;
  companyType: CompanyType;
  onboardingState: CompanyOnboardingState;
};

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
  id: string;
  assignedFirmSlug: string;
  companyType: CompanyType;
  hasExplicitAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  isDemoCompany: boolean;
  onboardingState: CompanyOnboardingState;
};

export type AccessibleCompaniesResponse = {
  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;
  accessibleCompanies: AccessibleCompanies[];
};
