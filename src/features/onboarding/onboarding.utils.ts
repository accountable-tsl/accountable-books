import {
  CompanyType,
  OnboardingStatus,
} from "../../domains/companies/companies.types";

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
