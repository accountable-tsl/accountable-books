import { z } from 'zod';

import { companyOnboardingState } from '../accounting/company.js';
import {
  supportAccessLevel,
  supportAccessOrigin,
} from '../accounting/support-access.js';
import { companyType, workspaceClass } from './enums.js';
import { roleKey, roleScope } from './roles.js';

export const authOnboardingStepKey = z.enum([
  'email_verified',
  'company_details_confirmed',
  'first_bank_account_added',
]);
export type AuthOnboardingStepKey = z.infer<typeof authOnboardingStepKey>;

export const authOnboardingStep = z.object({
  key: authOnboardingStepKey,
  label: z.string(),
  complete: z.boolean(),
  blocked: z.boolean(),
  optional: z.boolean(),
  scope: z.enum(['user', 'company']),
  orderIndex: z.number().optional(),
});
export type AuthOnboardingStep = z.infer<typeof authOnboardingStep>;

export const authCompanyContext = z.object({
  id: z.string().max(50),
  legalName: z.string(),
  displayName: z.string().nullable(),
  assignedFirmSlug: z.string(),
  companyType,
  workspaceClass,
  hasExplicitAccess: z.boolean(),
  roleKey: z.union([roleKey, z.null()]),
  roleScope: z.union([roleScope, z.null()]),
  isDemoCompany: z.boolean(),
  isPlatformCompany: z.boolean(),
  onboardingState: companyOnboardingState,
  accessOrigin: supportAccessOrigin,
  supportAccessLevel: z.union([supportAccessLevel, z.null()]),
  supportGrantId: z.union([z.uuid(), z.null()]),
  breakGlassSessionId: z.union([z.uuid(), z.null()]),
});
export type AuthCompanyContext = z.infer<typeof authCompanyContext>;

export const userOnboardingState = z
  .object({
    isCompanyOwner: z.boolean(),
    canAccessApp: z.boolean(),
    userStepsComplete: z.boolean(),
    nextStepToComplete: z.union([authOnboardingStepKey, z.null()]),
    steps: z.array(authOnboardingStep),
  })
  .passthrough();
export type UserOnboardingState = z.infer<typeof userOnboardingState>;

export const currentCompanyContext = authCompanyContext.extend({
  onboarding: userOnboardingState,
});
export type CurrentCompanyContext = z.infer<typeof currentCompanyContext>;

export const authUserContext = z.object({
  id: z.uuid(),
  email: z.email(),
  firstname: z.string(),
  lastname: z.string().optional(),
  isPlatformUser: z.boolean().optional(),
  platformUserKey: roleKey.optional(),
  currentCompanyId: z.string().max(50),
  currentCompany: currentCompanyContext,
  companies: z.array(authCompanyContext),
});
export type AuthUserContext = z.infer<typeof authUserContext>;

export const authSessionPayload = z.object({
  user: authUserContext,
  csrfToken: z.string(),
});
export type AuthSessionPayload = z.infer<typeof authSessionPayload>;

export const refreshSessionPayload = z.object({
  csrfToken: z.string(),
});
export type RefreshSessionPayload = z.infer<typeof refreshSessionPayload>;
