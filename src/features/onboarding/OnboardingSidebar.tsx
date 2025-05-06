import { ThemeToggle } from "@/components/ThemeToggle";
import { VerticalStepper } from "@/components/VerticalStepper";
import { CompanyData, CompanyType } from "@/domains/company/types";
import {
  ArrowUpCircleIcon,
  Building2Icon,
  CreditCardIcon,
  FileTextIcon,
  LucideIcon,
  MailCheckIcon,
  SettingsIcon,
} from "lucide-react";
import { ReactElement } from "react";

// Define step configurations
const steps = {
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
const getSteps = (companyType: CompanyType, isCreator: boolean) => {
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

export function OnboardingSidebar({
  company,
  companyType,
  isCreator,
  currentStep,
  footer,
}: {
  company: CompanyData;
  companyType: CompanyType;
  isCreator: boolean;
  currentStep: keyof typeof steps;
  footer?: string | React.ReactNode;
}) {
  const stepList = getSteps(companyType, isCreator);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center border-b h-12">
        <div className="flex items-center gap-2 p-4 md:h-12">
          <div className="bg-muted rounded-full flex items-center justify-center h-5 w-5 overflow-hidden">
            {company?.assignedFirmLogo ? (
              <img
                src={company?.assignedFirmLogo}
                alt={`${company?.assignedFirmName} Logo`}
              />
            ) : (
              <ArrowUpCircleIcon />
            )}
          </div>
          <div className="truncate">{company.assignedFirmName}</div>
        </div>
        <div className="justify-self-end md:hidden pr-2">
          <ThemeToggle />
        </div>
      </div>
      {/* <div className="px-4">Onboarding Steps</div> */}
      <VerticalStepper
        steps={stepList}
        currentStep={currentStep}
        footer={footer}
      />
    </div>
  );
}
