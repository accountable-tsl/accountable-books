export const userOnboardingStepKeys = {
  emailVerified: 'email_verified',
  // profileCompleted: "profile_completed",
} as const;

export const companyOnboardingStepKeys = {
  companyDetailsConfirmed: 'company_details_confirmed',
  firstBankAccountAdded: 'first_bank_account_added',
} as const;

export const onboardingStepKeys = {
  ...userOnboardingStepKeys,
  ...companyOnboardingStepKeys,
} as const;
