import { useIsMobile } from "@/shared/hooks/use-mobile";
import { OnboardingHeader } from "@/features/onboarding/shared/Header";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifyEmail } from "./steps/VerifyEmail";
import { onboardingStepsConfig } from "@/features/onboarding/utils";
import { CompanyInfo } from "@/features/onboarding/steps/CompanyInfo";
import { BankAccount } from "@/features/onboarding/steps/BankAccount";
import { useLocation, useParams } from "react-router-dom";
import {
  EnrichedOnboardingStep,
  OnboardingState,
  OnboardingStepKey,
} from "@/features/onboarding/types";
import { CenteredLoader } from "@/components/CenteredLoader";
import { CompanyData } from "@/domains/company/types";
import ErrorPage from "@/components/ErrorPage";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MockSidebar } from "@/components/SideBar/Sidebar";
import { useEffect, useMemo, useState } from "react";
import {
  MobileOnboardingSidebar,
  OnboardingSidebar,
} from "@/features/onboarding/shared/Sidebar";
import { useSession } from "../auth/Session";

const onboardingSteps: Record<
  string,
  { key: OnboardingStepKey; Component: React.FC }
> = {
  "verify-email": {
    key: "email_verified",
    Component: VerifyEmail,
  },
  "company-details": {
    key: "company_details_confirmed",
    Component: CompanyInfo,
  },
  "add-bank-account": {
    key: "first_bank_account_added",
    Component: BankAccount,
  },
};

export function OnboardingStepPage() {
  const {
    isLoggedIn,
    loading: sessionLoading,
    company,
    onboarding: onboardingState,
  } = useSession();

  const { step: stepParam } = useParams<{ step?: string }>();
  const pathname = useLocation().pathname;

  const step =
    stepParam && stepParam !== ":step" && stepParam !== "step"
      ? stepParam
      : Object.keys(onboardingSteps).find((key) =>
          pathname.endsWith(`/${key}`)
        );

  const stepInfo = step ? onboardingSteps[step] : undefined;
  const stepKey = stepInfo?.key;

  if (!stepKey) {
    return <ErrorPage type="default" />;
  }

  if (sessionLoading) {
    console.log("loading");
    return (
      <CenteredLoader
        fullscreen
        message="Loading..."
        showAuthHeader={isLoggedIn}
      />
    );
  }

  const StepComponent = stepInfo?.Component;
  if (!StepComponent) return <ErrorPage type="default" />;
  if (!isLoggedIn) return <StepComponent />;

  if (!onboardingState || !company) {
    return <ErrorPage type="default" />;
  }

  return (
    <OnboardingStepWrapper onboarding={onboardingState} company={company}>
      <StepComponent />
    </OnboardingStepWrapper>
  );
}

export function OnboardingStepWrapper({
  children,
  onboarding,
  company,
}: {
  children: React.ReactNode;
  onboarding: OnboardingState;
  company: CompanyData;
}) {
  const isMobile = useIsMobile();
  const nextStep = onboarding?.nextStepToComplete;
  const showSidebar = nextStep !== "email_verified";
  const sidebarWidth = "250px";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const onboardingSteps = onboarding.steps;
  const currentStep = onboarding.nextStepToComplete;
  // const lastStep = onboardingSteps[onboardingSteps.length - 1].key;

  // Return an array of steps that match the order in onboarding steps defined above using property orderIndex or keeping the original order if not defined
  const steps: EnrichedOnboardingStep[] = useMemo(
    () =>
      onboardingSteps
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
        .map((step) => {
          const config = onboardingStepsConfig[step.key];

          return {
            ...config,
            ...step,
            current: step.key === currentStep,
          };
        }),
    [onboardingSteps, currentStep]
  );

  const currentStepObj = useMemo(
    () => steps.find((step) => step.key === currentStep),
    [steps, currentStep]
  );

  const currentStepIndex = useMemo(
    () => steps.findIndex((step) => step.key === currentStep),
    [steps, currentStep]
  );

  // Close the sidebar when the escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    if (mobileSidebarOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [mobileSidebarOpen]);

  // Prevent scrolling when the sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileSidebarOpen]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <>
        {!isMobile && (
          <SidebarProvider>
            <MockSidebar />
          </SidebarProvider>
        )}
        {/* Overlay */}
        <div
          className={cn(
            "z-10 w-full",
            !isMobile
              ? "absolute inset-0 flex items-center justify-center bg-black/70"
              : mobileSidebarOpen
              ? "absolute inset-0 bg-black/70"
              : "relative"
          )}
        >
          {/* Onboarding Box */}
          <div className="w-full max-w-5xl h-[100vh] md:h-fit md:min-h-[50vh] md:max-h-[85vh] bg-background rounded-md border overflow-hidden flex flex-col">
            {/* Sidebar (progress tracker) — only on desktop */}

            <OnboardingHeader
              firmName={company?.assignedFirmName ?? ""}
              logoUrl={company?.assignedFirmLogo ?? ""}
              className="sticky top-0 z-10 bg-background border-b"
              sidebarWidth={sidebarWidth}
              showSidebar={showSidebar}
            />
            <div
              className={cn(
                "flex overflow-hidden flex-1",
                isMobile ? "flex-col" : ""
              )}
            >
              {showSidebar && !isMobile && (
                <div
                  className={cn(
                    sidebarWidth ? `w-[${sidebarWidth}]` : "w-[250px]",
                    "border-r flex"
                  )}
                >
                  <OnboardingSidebar steps={steps} />
                </div>
              )}

              {/* Mobile header with current step and menu button */}
              {isMobile && (
                <div className="flex items-center justify-between p-3 rounded-md mb-4 bg-card shadow-sm m-4">
                  <div
                    className="p-2 rounded-md outline bg-background"
                    onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                    aria-expanded={mobileSidebarOpen}
                    aria-controls="mobile-onboarding-sidebar"
                  >
                    <Menu className="w-5 h-5" />
                    <span className="sr-only">
                      Toggle onboarding navigation menu
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm">
                      {currentStepObj && (
                        <currentStepObj.icon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-sm">{currentStepObj?.title}</span>
                    <span className="text-xs text-gray-500">
                      Step {currentStepIndex + 1} of {steps.length}
                    </span>
                  </div>
                </div>
              )}

              {/* Main content */}
              <div className="flex-1 flex py-2 overflow-y-auto scrollbar-thin-2px">
                {children}
              </div>
            </div>
          </div>

          {mobileSidebarOpen && (
            <MobileOnboardingSidebar
              steps={steps}
              onClose={() => setMobileSidebarOpen(false)}
            />
          )}
        </div>
      </>
    </div>
  );
}
