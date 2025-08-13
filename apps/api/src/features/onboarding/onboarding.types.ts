import { z } from "zod";
import {
  companyOnboardingStepKeys,
  onboardingStepKeys,
  userOnboardingStepKeys,
} from "./onboarding.utils";
import { dateOrStringNullish } from "../../shared/utils/random.utils";

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
  Record<UserOnboardingStepKey, Date | null>
>;
export type CompanyOnboardingStepsCompletedAt = Partial<
  Record<CompanyOnboardingStepKey, Date | null>
>;

export const userOnboardingState = z
  .object({
    steps: z.object({
      email_verified: z.boolean(),
      // profile_completed: z.boolean(),
    }),
    completed_at: z
      .object({
        email_verified: dateOrStringNullish,
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
      company_details_confirmed: z.boolean().nullish(),
      first_bank_account_added: z.boolean().nullish(),
    }),
    completed_at: z
      .object({
        company_details_confirmed: dateOrStringNullish,
        first_bank_account_added: dateOrStringNullish,
      })
      .optional(),
    metadata: z.null().nullish(),
  })
  .nullish();

export type CompanyOnboardingState = z.infer<
  typeof companyOnboardingState
> | null;

export type OnboardingUserObj = {
  id: string;
  emailVerifiedAt: Date | null;
  isPlatformUser?: boolean;
  onboardingState: UserOnboardingState;
};
export type OnboardingCompanyObj = {
  id: string;
  isDemoCompany?: boolean;
  isPlatformCompany?: boolean;
  onboardingState: CompanyOnboardingState;
};

export type OnboardingStepConfig = {
  key: OnboardingStepKey;
  label: string;
  scope: "user" | "company";
  restrictedTo?: "company_owner";
  optional?: boolean;
  orderIndex: number;
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

export type OnboardingState = {
  steps: Record<string, boolean | null | undefined>;
  completed_at?: Record<string, Date | null | undefined>;
  metadata?: any;
  // [key: string]: any;
};
