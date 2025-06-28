import { z } from "zod";
import {
  companyOnboardingStepKeys,
  onboardingStepKeys,
  userOnboardingStepKeys,
} from "./onboarding.utils";
import { any } from "jest-mock-extended";
import { RoleKey } from "../../domains/roles/roles.types";

// STEP KEYS
export type UserOnboardingStepKey =
  (typeof userOnboardingStepKeys)[keyof typeof userOnboardingStepKeys];
export type CompanyOnboardingStepKey =
  (typeof companyOnboardingStepKeys)[keyof typeof companyOnboardingStepKeys];
export type OnboardingStepKey =
  (typeof onboardingStepKeys)[keyof typeof onboardingStepKeys];

// ONBOARDING STEPS
export type UserOnboardingSteps = Record<UserOnboardingStepKey, boolean>;
export type CompanyOnboardingSteps = Record<CompanyOnboardingStepKey, boolean>;

// ONBOARDING STEPS COMPLETED AT
export type UserOnboardingStepsCompletedAt = Partial<
  Record<UserOnboardingStepKey, Date>
>;
export type CompanyOnboardingStepsCompletedAt = Partial<
  Record<CompanyOnboardingStepKey, Date>
>;

export const userOnboardingState = z
  .object({
    steps: z.object({
      email_verified: z.boolean(),
      // profile_completed: z.boolean(),
    }),
    completed_at: z
      .object({
        email_verified: z.date().nullish(),
        // profile_completed: z.date().nullish(),
      })
      .optional(),
  })
  .nullish();

export type UserOnboardingState = {
  steps: UserOnboardingSteps;
  completed_at?: UserOnboardingStepsCompletedAt;
} | null;

export const companyOnboardingState = z
  .object({
    steps: z.object({
      company_details_confirmed: z.boolean(),
      first_bank_account_added: z.boolean(),
    }),
    completed_at: z
      .object({
        company_details_confirmed: z.date().nullish(),
        first_bank_account_added: z.date().nullish(),
      })
      .optional(),
    metadata: z.null().nullish(),
  })
  .nullish();
// export type CompanyOnboardingState = {
//   steps: CompanyOnboardingSteps;
//   completed_at?: CompanyOnboardingStepsCompletedAt;
//   metadata?: null;
// } | null;
export type CompanyOnboardingState = z.infer<
  typeof companyOnboardingState
> | null;

export type OnboardingUserObj = {
  id: string;
  emailVerifiedAt: Date;
  onboardingState: UserOnboardingState;
  isPlatformUser?: boolean;
};
export type OnboardingCompanyObj = {
  id: string;
  onboardingState: CompanyOnboardingState;
  isDemoCompany?: boolean;
  isPlatformCompany?: boolean;
};

export type OnboardingStepConfig = {
  key: OnboardingStepKey;
  label: string;
  scope: "user" | "company";
  restrictedTo?: "company_owner";
  optional?: boolean;
  dependsOn?: OnboardingStepKey[];
  orderIndex?: number;
  isComplete: (args: {
    user: OnboardingUserObj;
    company: OnboardingCompanyObj | null;
  }) => boolean;
  isAvailable?: (args: {
    user: OnboardingUserObj;
    company: OnboardingCompanyObj;
    isCompanyOwner: boolean;
  }) => boolean;
};

export type OnboardingStateResult = {
  isCompanyOwner: boolean;
  canAccessApp: boolean;
  userStepsComplete: boolean;
  nextStepToComplete: OnboardingStepKey | null;
  steps: {
    key: OnboardingStepKey;
    label: string;
    complete: boolean;
    blocked: boolean;
    optional: boolean;
    scope: "user" | "company";
    orderIndex?: number;
  }[];
};
