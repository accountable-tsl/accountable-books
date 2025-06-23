import { ThemeToggle } from "@/components/ThemeToggle";
import { VerticalStepper } from "@/components/VerticalStepper";
import { ArrowUpCircleIcon } from "lucide-react";
import { getSteps, onboardingSteps } from "@/features/onboarding/utils";
import { OnboardingSideBarProps } from "../types";
import { useCompany } from "@/domains/company/store";

export function OnboardingSidebar({
  companyType,
  currentStep,
  isCreator,
  footer,
}: OnboardingSideBarProps) {
  const { company } = useCompany();
  const steps = getSteps(onboardingSteps, companyType, isCreator);
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
          <div className="truncate">{company?.assignedFirmName}</div>
        </div>
        <div className="justify-self-end md:hidden pr-2">
          <ThemeToggle />
        </div>
      </div>
      {/* <div className="px-4">Onboarding Steps</div> */}
      <VerticalStepper
        steps={steps}
        currentStep={currentStep}
        footer={footer}
      />
    </div>
  );
}
