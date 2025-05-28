import { CompanyType } from "../../domains/companies/companies.types";
import { UserOnboardingStatus } from "../../domains/users/users.types";

export const decideNextStatus = (
  currentStatus: UserOnboardingStatus,
  companyType: CompanyType,
  isInvited: boolean = false
): UserOnboardingStatus => {
  switch (currentStatus) {
    case "not_started":
      return "email_verified";

    case "email_verified":
      if (isInvited) return "onboarding_complete";
      if (companyType === "individual") return "creator_bank_account_needed";
      return "creator_vitals_needed";

    case "creator_vitals_needed":
      return "creator_bank_account_needed";

    case "creator_bank_account_needed":
      return "onboarding_complete";

    default:
      return "onboarding_complete";
  }
};
