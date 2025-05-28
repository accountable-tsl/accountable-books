import {
  Building2Icon,
  CreditCardIcon,
  FileTextIcon,
  MailCheckIcon,
  SettingsIcon,
} from "lucide-react";
import { OnboardingSideBarSteps, OnboardingSteps } from "./types";
import { UserOnboardingStatus } from "@/domains/user/types";
import { CompanyData, CompanyType } from "@/domains/company/types";
import { getDefaultCompanyData } from "@/domains/company/utils";

// export const stepMap: Record<UserOnboardingStatus, OnboardingSteps> = {
//   not_started: "verifyEmail",
//   email_verified: "verifyEmail",
//   creator_vitals_needed: "companyVitals",
//   creator_bank_account_needed: "addBankAccount",
//   onboarding_complete: "miscellaneous",
// };

// Define step configurations
export const onboardingSteps: OnboardingSideBarSteps = {
  verifyEmail: {
    icon: MailCheckIcon,
    key: "verifyEmail",
    title: "Verify Email",
    description: "Confirm your email address",
  },
  companyVitals: {
    icon: Building2Icon,
    key: "companyVitals",
    title: "Company Vitals",
    description: "Enter company name and type",
  },
  companyDetails: {
    icon: FileTextIcon,
    key: "companyDetails",
    title: "Company Details",
    description: "Provide country and registration ID",
  },
  addBankAccount: {
    icon: CreditCardIcon,
    key: "addBankAccount",
    title: "Add Bank Account",
    description: "Link your bank account",
  },
  miscellaneous: {
    icon: SettingsIcon,
    key: "miscellaneous",
    title: "Miscellaneous",
    description: "Additional settings",
  },
};

export const getSteps = (
  steps: OnboardingSideBarSteps,
  companyType: CompanyType,
  isCreator: boolean
) => {
  if (!isCreator) {
    return [steps.verifyEmail, steps.miscellaneous];
  }

  if (companyType === "individual") {
    return [steps.verifyEmail, steps.addBankAccount, steps.miscellaneous];
  }

  return [
    steps.verifyEmail,
    steps.companyVitals,
    steps.companyDetails,
    steps.addBankAccount,
    steps.miscellaneous,
  ];
};

export const getCurrentStep = (
  status: UserOnboardingStatus,
  companyType: CompanyType | undefined,
  isCreator: boolean | undefined
): OnboardingSteps => {
  if (!companyType || isCreator === undefined) return "verifyEmail";

  if (companyType === "individual") {
    if (status === "creator_bank_account_needed") return "addBankAccount";
    if (status === "onboarding_complete") return "miscellaneous";
    return "verifyEmail";
  }

  // for companies & firms
  if (status === "creator_vitals_needed") return "companyVitals";
  if (status === "creator_bank_account_needed") return "addBankAccount";
  if (status === "onboarding_complete") return "miscellaneous";

  return "verifyEmail";
};

export function mergeInitialData(
  dbData: CompanyData | null,
  saved: Partial<CompanyData> | null
): CompanyData {
  const base = getDefaultCompanyData();
  return { ...base, ...dbData, ...saved } as CompanyData; // precedence: saved > db > defaults
}
