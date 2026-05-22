import type { AuthCompanyContext } from '@accountable-books/contracts/schema';
import { type Knex } from 'knex';
import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { type CompanyOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { createCamelCaseSchema } from '../../shared/utils/formatting.utils.js';
import {
  type CompanyType,
  type WorkspaceClass,
} from '../companies/companies.types.js';
import { type RoleKey, type RoleScope } from '../roles/roles.types.js';

import type { SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

export const userCompanyRoleBase = z.object({
  user_id: z.uuid(),
  company_id: z.uuid(),
  role_id: z.uuid(),
  updated_by_id: z.uuid().nullish(),
  created_by_id: z.uuid().nullish(),
});
export const newUserCompanyRoleInput =
  createCamelCaseSchema(userCompanyRoleBase);
export type NewUserCompanyRoleInput = SnakeToCamelCaseObject<
  z.infer<typeof newUserCompanyRole>
>;

export const newUserCompanyRole = userCompanyRoleBase.extend({
  created_by_id: z.uuid(),
});
export type NewUserCompanyRole = z.infer<typeof newUserCompanyRole>;

export const userCompanyRole = newUserCompanyRole.merge(dbBaseFields);
export type UserCompanyRole = z.infer<typeof userCompanyRole>;

export type CompanyBaseFields = {
  companyId: string;
  legalName: string;
  displayName: string | null;
  companyType: CompanyType;
  workspaceClass: WorkspaceClass;
  firmSlug: string | null;
  isPlatformCompany: boolean;
};

export type UserCompanyRoleWithDetails = CompanyBaseFields & {
  membershipId: string;
  userId: string;
  roleId: string;
  roleKey: RoleKey;
  roleName: string;
  roleScope: RoleScope;
  onboardingState: CompanyOnboardingState;
  isDemoCompany: boolean;
};

export type RoleQueryResult = UserCompanyRoleWithDetails;
export type UserCompanyRoleAssignmentRes = UserCompanyRoleWithDetails;
export type DemoCompany = CompanyBaseFields;

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

// Access fields match contract authCompanyContext; onboardingState stays API-shaped (Dates).
export type AccessibleCompanies = Omit<
  AuthCompanyContext,
  'onboardingState'
> & {
  onboardingState: CompanyOnboardingState | null;
};

export type AccessibleCompaniesResponse = {
  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;
  accessibleCompanies: AccessibleCompanies[];
};
