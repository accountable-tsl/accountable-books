import { CompanyData } from "@/domains/company/types";
import { LucideIcon } from "lucide-react";
import { z } from "zod";

export const phoneNumberFormSchema = z.object({
  phone: z.object({
    phoneNumber: z.string().min(1, "Phone number is required"),
    countryCode: z.string(),
    completeNumber: z.string().min(1, "Phone number is required"),
  }),
});

export type PhoneNumberForm = z.infer<typeof phoneNumberFormSchema>;

export type VerifyEmailProps = {
  email: string;
};

export const onboardingSteps = z.enum([
  "verifyEmail",
  "companyVitals",
  "addBankAccount",
  "miscellaneous",
]);
export type OnboardingSteps = z.infer<typeof onboardingSteps>;

export type OnboardingSideBarSteps = {
  [K in OnboardingSteps]: {
    icon: LucideIcon;
    title: string;
    description: string;
    key: OnboardingSteps;
  };
};

export type Contact = {
  phoneNumber: string;
  countryCode: string;
  completeNumber: string;
};

export type ResendVerEmailService =
  | {
      userId: string;
    }
  | {
      email: string;
    }
  | {
      userId: string;
      email: string;
    };

export type OnboardingSideBarProps = {
  company: Pick<
    CompanyData,
    | "id"
    | "onboardingStatus"
    | "legalName"
    | "displayName"
    | "companyType"
    | "assignedFirmLogo"
    | "assignedFirmName"
    | "createdById"
  >;
  currentStep: keyof typeof onboardingSteps;
  isCreator: boolean;
  footer?: string | React.ReactNode;
};

export type VerifyEmailFnResponse = {
  emailVerified: boolean;
  status: "verified" | "invalid_or_expired" | "error" | null;
  slug?: string | null;
  email: string | null;
};

export const userOnboardingStepKeys = {
  emailVerified: "email_verified",
  // profileCompleted: "profile_completed",
} as const;

export const companyOnboardingStepKeys = {
  companyDetailsConfirmed: "company_details_confirmed",
  firstBankAccountAdded: "first_bank_account_added",
} as const;

export const onboardingStepKeys = {
  ...userOnboardingStepKeys,
  ...companyOnboardingStepKeys,
} as const;

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
        email_verified: z.date().optional(),
        // profile_completed: z.date().nullish(),
      })
      .optional(),
  })
  .nullish();

export type UserOnboardingState = {
  steps: UserOnboardingSteps;
  completed_at?: UserOnboardingStepsCompletedAt;
} | null;

export const onboardingStateObject = z
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

export type OnboardingStateObject = z.infer<
  typeof onboardingStateObject
> | null;

export type OnboardingUserObj = {
  id: string;
  emailVerifiedAt: Date;
  onboardingState: UserOnboardingState;
  isPlatformUser?: boolean;
};
export type OnboardingCompanyObj = {
  id: string;
  onboardingState: OnboardingStateObject;
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

export type CompanyOnboardingState = OnboardingStateResult;
