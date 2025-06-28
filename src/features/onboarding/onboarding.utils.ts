import { CompanyType } from "../../domains/companies/companies.types";
import {
  CompanyOnboardingState,
  CompanyOnboardingStepKey,
  CompanyOnboardingSteps,
  OnboardingStepConfig,
  UserOnboardingState,
  UserOnboardingStepKey,
} from "./onboarding.types";

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

export const onboardingStepConfig: OnboardingStepConfig[] = [
  {
    key: "email_verified",
    label: "Verify your email",
    scope: "user",
    optional: false,
    orderIndex: 1,
    isComplete: ({ user }) =>
      user?.isPlatformUser ||
      !!user.emailVerifiedAt ||
      user.onboardingState?.steps.email_verified === true,
  },
  {
    key: "company_details_confirmed",
    label: "Confirm company details",
    scope: "company",
    restrictedTo: "company_owner",
    dependsOn: ["email_verified"],
    orderIndex: 2,
    isComplete: ({ company }) =>
      company?.isDemoCompany ||
      company?.isPlatformCompany ||
      !!company?.onboardingState?.steps.company_details_confirmed,
  },
  {
    key: "first_bank_account_added",
    label: "Add a bank account",
    scope: "company",
    restrictedTo: "company_owner",
    dependsOn: ["company_details_confirmed"],
    orderIndex: 3,
    isComplete: ({ company }) =>
      company?.isDemoCompany ||
      company?.isPlatformCompany ||
      !!company?.onboardingState?.steps.first_bank_account_added,
  },
  // Invite team
];

export const createInitialCompanyOnboardingState =
  (): CompanyOnboardingState => ({
    steps: {
      company_details_confirmed: false,
      first_bank_account_added: false,
    },
    completed_at: {},
  });

export const createInitialUserOnboardingState = (): UserOnboardingState => ({
  steps: {
    email_verified: false,
  },
  completed_at: {},
});

export const markUserOnboardingStepComplete = (
  currentState: UserOnboardingState,
  step: UserOnboardingStepKey
): UserOnboardingState => {
  if (!currentState)
    throw new Error("Please provide current user onboarding state");

  const now = new Date();

  return {
    ...currentState,
    steps: {
      ...currentState.steps,
      [step]: true,
    },
    completed_at: {
      ...(currentState.completed_at ?? {}),
      [step]: now,
    },
  };
};

export const markCompanyOnboardingStepComplete = (
  currentState: CompanyOnboardingState,
  step: CompanyOnboardingStepKey
): CompanyOnboardingState => {
  if (!currentState) {
    throw new Error("Please provide current company onboarding state");
  }

  const now = new Date();

  return {
    ...currentState,
    steps: {
      ...currentState.steps,
      [step]: true,
    },
    completed_at: {
      ...(currentState.completed_at ?? {}),
      [step]: now,
    },
  };
};

export const decideNextStatus = (
  currentStatus: OnboardingStatus,
  companyType: CompanyType,
  isLoggedIn: boolean = false,
  isInvited: boolean = false
): OnboardingStatus => {
  switch (currentStatus) {
    case "not_started":
      return "email_verified";

    case "email_verified":
      if (isInvited) return "onboarding_complete";
      if (companyType === "individual") return "first_bank_account_needed";
      return "company_vitals_needed";

    case "company_vitals_needed":
      return "first_bank_account_needed";

    case "first_bank_account_needed":
      return "onboarding_complete";

    default:
      return "onboarding_complete";
  }
};
