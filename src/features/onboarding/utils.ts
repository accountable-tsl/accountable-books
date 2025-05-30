import {
  Building2Icon,
  CreditCardIcon,
  FileTextIcon,
  MailCheckIcon,
  SettingsIcon,
} from "lucide-react";
import { OnboardingSideBarSteps, OnboardingSteps } from "./types";
import {
  CompanyData,
  CompanyType,
  OnboardingStatus,
} from "@/domains/company/types";
import { getDefaultCompanyData } from "@/domains/company/utils";

export const stepMap: Record<OnboardingStatus, OnboardingSteps> = {
  not_started: "verifyEmail",
  email_verified: "verifyEmail", // Verify Email Page 2
  company_vitals_needed: "companyVitals",
  first_bank_account_needed: "addBankAccount",
  onboarding_complete: "miscellaneous",
};

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

export const stepOrder: OnboardingSteps[] = [
  "verifyEmail",
  "companyVitals",
  "addBankAccount",
  "miscellaneous",
];
export const isStepAllowed = (
  targetStep: OnboardingSteps,
  currentStatus: OnboardingStatus
): boolean => {
  const allowedStep = stepMap[currentStatus] || "verifyEmail";
  const allowedIndex = stepOrder.indexOf(allowedStep);
  const targetIndex = stepOrder.indexOf(targetStep);
  return targetIndex <= allowedIndex;
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
    steps.addBankAccount,
    steps.miscellaneous,
  ];
};

export function mergeInitialData(
  dbData: CompanyData | null,
  saved: Partial<CompanyData> | null
): CompanyData {
  const base = getDefaultCompanyData();
  return { ...base, ...dbData, ...saved } as CompanyData; // precedence: saved > db > defaults
}
