import { ThemeToggle } from "@/components/ThemeToggle";
import { VerticalStepper } from "@/components/VerticalStepper";
import { ArrowUpCircleIcon } from "lucide-react";
import { getSteps } from "@/features/onboarding/utils";
import { OnboardingSideBarProps } from "../types";
import { useCompany } from "@/domains/company/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/domains/company/store";
import { useAuth, useSessionLoader } from "../auth/hooks";
import { OnboardingSidebar } from "@/features/onboarding/shared/Sidebar";
import { MockDashboard } from "../dashboard/MockDashboard";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Sheet } from "@/components/ui/sheet";
import { OnboardingHeader } from "@/features/onboarding/shared/Header";
import {
  ArrowUpCircleIcon,
  Check,
  HeadsetIcon,
  MenuIcon,
  ScreenShareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VerifyEmail } from "./steps/VerifyEmail";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isStepAllowed,
  onboardingStepsConfig,
  onboardingStepToSlug,
  stepMap,
} from "./utils";
import { CompanyInfo } from "@/features/onboarding/steps/CompanyInfo";
import { BankAccount } from "@/features/onboarding/steps/BankAccount";
import { Miscellaneous } from "@/features/onboarding/steps/Miscellaneous";
import { toast } from "sonner";
import { matchPath, useNavigate, useParams } from "react-router-dom";
import {
  OnboardingSideBarProps,
  OnboardingState,
  OnboardingStepKey,
  onboardingSteps,
  OnboardingSteps,
} from "@/features/onboarding/types";
import { CenteredLoader } from "@/components/CenteredLoader";
import {
  CompanyData,
  onboardingStatus,
  OnboardingStatus,
} from "@/domains/company/types";
import { getCompanyDetails } from "@/domains/company/api";
import { routes } from "@/shared/routes/routes";
import { useCompanySwitch } from "../switchCompany/hooks";
import { DEMO_COMPANIES_IDS } from "@/domains/company/constants";
import ErrorPage from "@/components/ErrorPage";
import { useCompanyDetails } from "@/domains/company/hooks";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Old Sidebar file
export function OnboardingSidebarGanGan({
  companyType,
  currentStep,
  isCreator,
  footer,
}: OnboardingSideBarProps) {
  const { company } = useCompany();
  const steps = getSteps(onboardingSteps || [], companyType, isCreator);
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

export function OnboardingForm({
  step: overrideStep,
}: {
  step?: OnboardingSteps;
}) {
  // Hooks, Context
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { companyId, company, companyType, setCompany, setOnboardingStatus } =
    useCompany();
  const { user, isLoggedIn, logout } = useAuth();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [hasDoneMiscInSession, setHasDoneMiscInSession] = useState(false);

  // Computed
  const status = useMemo<OnboardingStatus>(
    () => company?.onboardingStatus ?? "not_started",
    [company?.onboardingStatus]
  );

  const statusRef = useRef(status);
  const companyIdRef = useRef(companyId || company?.id);
  const companyRef = useRef(company);

  const isCreator = useMemo(
    () => user?.id === company?.createdById,
    [user?.id, company?.createdById]
  );

  const currentStep = useMemo<OnboardingSteps>(
    () => stepMap[status] || "verifyEmail",
    [status]
  );

  const step = useMemo<OnboardingSteps>(() => {
    return overrideStep && isStepAllowed(overrideStep, status)
      ? overrideStep
      : currentStep;
  }, [overrideStep, status, currentStep]);

  const isMinimalStep = useMemo(
    () => step === "verifyEmail" && (!isLoggedIn || !company || !companyType),
    [step, isLoggedIn, company, companyType]
  );

  const shouldBlockRender = useMemo(
    () => isLoading || (!isMinimalStep && (!company || !companyType || !step)),
    [isLoading, isMinimalStep, company, companyType, step]
  );

  const shouldShowMisc =
    status === onboardingStatus.enum.onboarding_complete &&
    !hasDoneMiscInSession;

  // Callbacks
  const handleStatusChange = useCallback(
    (s: OnboardingStatus) => setOnboardingStatus(s),
    [setOnboardingStatus]
  );

  const fetchCompanyData = useCallback(async () => {
    const id = companyIdRef.current;
    if (!user?.id || !id) return;

    try {
      const res = await getCompanyDetails(id);
      if (res.success && res.data) {
        const currentCompany = companyRef.current;

        if (!currentCompany) {
          setCompany(res.data); // First load
          return;
        }

        // Check specific fields that affect the UI
        const fieldsToCheck: (keyof typeof res.data)[] = [
          "id",
          "onboardingStatus",
          "legalName",
          "displayName",
          "companyType",
          "assignedFirmLogo",
          "assignedFirmName",
          "createdById",
        ];

        const hasChanged = fieldsToCheck.some(
          (field) => res.data?.[field] !== currentCompany[field]
        );

        if (hasChanged) {
          setCompany(res.data);
        }

        // if (res.data.onboardingStatus !== statusRef.current) {
        //   setCompany(res.data);
        // }
      } else {
        toast.error(res.message || "Failed to fetch company data");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  }, [user?.id, setCompany]);

  /**
   * TODO: Replace polling with real-time onboarding status updates
   * PROBLEM: Current polling causes unnecessary re-renders even when status unchanged,
   * breaking components like ConnectBankAccount that have external widgets
   *
   * IDEAL SOLUTION:
   * 1. WebSocket/SSE connection for real-time status updates
   * 2. Server pushes status changes instead of client polling
   * 3. Only re-render when status actually changes
   * 4. Add connection health monitoring and fallback polling
   *
   * IMPLEMENTATION:
   * - Add WebSocket endpoint: /ws/companies/{id}/onboarding-status
   * - Server broadcasts when: email verified, bank connected, etc.
   * - Client subscribes on mount, unsubscribes on unmount
   * - Fallback to polling only if WebSocket connection fails
   *
   * BENEFITS: Real-time updates, no unnecessary re-renders, better UX
   * */

  // Effects

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    companyIdRef.current = companyId || company?.id;
  }, [companyId, company?.id]);

  useEffect(() => {
    companyRef.current = company;
  }, [company]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const loadData = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      if (!company) {
        setIsLoading(true);
      }

      await fetchCompanyData();
      if (!company) {
        setIsLoading(false);
      }

      const id = companyIdRef.current;
      if (id && status !== onboardingStatus.enum.onboarding_complete) {
        intervalId = setInterval(fetchCompanyData, 10_000);
      }
    };

    loadData();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.id, fetchCompanyData]);

  useEffect(() => {
    const id = companyId || company?.id;
    if (status === onboardingStatus.enum.onboarding_complete && id) {
      navigate(routes.dashboard.buildPath({ companyId: id }));
    }
  }, [status, companyId, company, navigate]);

  useEffect(() => {
    if (overrideStep && !isStepAllowed(overrideStep, status)) {
      toast.error(`Cannot access ${overrideStep} yet. Complete prior steps.`);
      navigate(routes.onboarding.step.buildPath({ step: currentStep }));
    }
  }, [overrideStep, status, currentStep, navigate]);

  // Components
  // The sidebar uses this data to determine which steps to show
  const sidebarProps = useMemo(() => {
    if (!company || !user) return null;

    const stableCompany = {
      id: company.id,
      onboardingStatus: company.onboardingStatus,
      legalName: company.legalName,
      companyType: company.companyType,
      assignedFirmLogo: company.assignedFirmLogo,
      assignedFirmName: company.assignedFirmName,
      displayName: company.displayName,
      createdById: company.createdById,
    };

    return {
      company: stableCompany,
      currentStep: step as keyof typeof onboardingSteps,
      isCreator,
    };
  }, [
    company?.id,
    company?.onboardingStatus,
    company?.legalName,
    company?.displayName,
    company?.companyType,
    company?.assignedFirmLogo,
    company?.assignedFirmName,
    company?.createdById,
    user?.id,
    step,
    isCreator,
  ]);

  const stepElement = useMemo(() => {
    if (shouldShowMisc) {
      return <Miscellaneous onDone={() => setHasDoneMiscInSession(true)} />;
    }

    switch (step) {
      case "verifyEmail":
        return <VerifyEmail onStatusChange={handleStatusChange} />;
      case "companyVitals":
        return <CompanyInfo />;
      case "addBankAccount":
        return <BankAccount onBankAccountComplete={handleStatusChange} />;
      default:
        return null;
    }
  }, [step, handleStatusChange, shouldShowMisc]);

  if (shouldBlockRender) return <CenteredLoader />;

  return (
    <OnboardingFormWrapper
      isMinimalStep={isMinimalStep}
      isMobile={isMobile}
      sidebarProps={sidebarProps}
      stepElement={stepElement}
    />
  );
}

const OnboardingFormWrapper = ({
  isMinimalStep,
  isMobile,
  sidebarProps,
  stepElement,
}: {
  isMinimalStep: boolean;
  isMobile: boolean;
  sidebarProps: OnboardingSideBarProps | null;
  stepElement: React.ReactNode;
}) => {
  if (isMinimalStep) {
    return <div className="p-6">{stepElement}</div>;
  }

  if (isMobile) {
    return (
      <Sheet>
        <div className="flex flex-col h-dvh overflow-hidden">
          {sidebarProps && (
            <OnboardingSidebar
              {...sidebarProps}
              footer={<OnboardingFormFooter />}
            />
          )}
          {stepElement}
        </div>
      </Sheet>
    );
  }

  return (
    <>
      {/* No fancy UI if user is not logged in */}
      <div>
        <MockDashboard />

        <StableDialog>
          <DialogHeader className="hidden">
            <DialogTitle>Onboarding Form</DialogTitle>
            <DialogDescription>
              Multi step onboarding process to setup your company on the
              platform
            </DialogDescription>
          </DialogHeader>
          <DialogContent className="flex [&>button]:hidden h-fit min-h-[75vh] max-h-[75vh] min-w-[85vw] max-w-[90vw] overflow-hidden p-0 gap-0">
            <div className="min-w-[14rem] w-1/5 md:w-[18rem] bg-card shadow-md overflow-hidden flex flex-col justify-between">
              {sidebarProps && <OnboardingSidebar {...sidebarProps} />}
              <OnboardingFormFooter />
            </div>

            <div className="flex flex-col flex-1">
              <OnboardingHeader className="md:mb-4" />
              {stepElement}
            </div>
          </DialogContent>
        </StableDialog>
      </div>
    </>
  );
};

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
  const isNextStepVerifyEmail = nextStep === "email_verified";

  if (isMobile) {
    return (
      <Sheet>
        <div className="flex flex-col h-dvh overflow-hidden">
          <OnboardingSidebarN onboarding={onboarding} company={company} />
          {children}
        </div>
      </Sheet>
    );
  }

  return (
    <div>
      <MockDashboard />

      <StableDialog>
        <DialogHeader className="hidden">
          <DialogTitle>Onboarding Form</DialogTitle>
          <DialogDescription>
            Multi step onboarding process to setup your company on the platform
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="flex [&>button]:hidden h-fit min-h-[75vh] max-h-[75vh] min-w-[85vw] max-w-[90vw] overflow-hidden p-0 gap-0">
          <OnboardingSidebarN onboarding={onboarding} company={company} />

          <div className="flex flex-col flex-1">
            <OnboardingHeader />
            {children}
          </div>
        </DialogContent>
      </StableDialog>
    </div>
  );
}

const StableDialog = ({ children }: { children: React.ReactNode }) => {
  const [isOpen] = useState(true);

  return <Dialog open={isOpen}>{children}</Dialog>;
};

function OnboardingSidebar({
  onboarding,
  company,
}: {
  onboarding: OnboardingState;
  company: CompanyData;
}) {
  const isMobile = useIsMobile();
  const nameParts = (company?.assignedFirmName ?? "").split(" ");
  const initials =
    nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0);

  const onboardingSteps = onboarding.steps;
  const currentStep = onboarding.nextStepToComplete;
  const lastStep = onboardingSteps[onboardingSteps.length - 1].key;

  // Return an array of steps that match the order in onboarding steps defined above using property orderIndex or keeping the original order if not defined
  // Use the
  const steps = onboardingSteps
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    .map((step) => {
      return {
        ...onboardingStepsConfig[step.key],
        ...step,
        current: step.key === currentStep,
      };
    });

  const currentStepObj = steps.find((step) => step.key === currentStep);
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  const renderedSteps = (
    <div className={isMobile ? "" : "relative flex flex-col gap-6 pt-4"}>
      <div className="absolute top-4 bottom-4 left-4 w-px bg-border z-0" />

      {steps.map((step) => {
        const { title, description, icon: Icon, current, complete } = step;
        const isLastStep = step.key === lastStep;
        return (
          <div
            key={step.key}
            className="relative flex gap-2 items-center text-sm md:text-base"
          >
            <div
              className={cn(
                // "bg-background p-2 rounded-md outline relative flex h-8 w-8 shrink-0 items-center justify-center border",
                "h-8 w-8 flex items-center justify-center shrink-0 border rounded-md bg-background",
                current ? "border-foreground" : ""
              )}
            >
              {complete ? (
                <Check size={14} />
              ) : (
                <Icon
                  color={`${current ? "currentColor" : "gray"}`}
                  size={14}
                />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <div
                className={cn(
                  "truncate text-sm text-muted-foreground/50",
                  current ? "text-card-foreground" : ""
                  // current || completed ? "text-gray-900" : "text-gray-500"
                )}
              >
                {title}
              </div>
              <div
                className={cn(
                  "text-muted-foreground/30 text-xs truncate",
                  current ? "text-card-foreground/50" : "" // "truncate text-xs text-gray-500"
                )}
              >
                {description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* TOP BAR */}
        <div className="flex justify-between items-center border-b h-12">
          <div className="flex items-center gap-2 p-4 md:h-12">
            <div className="bg-muted rounded-full flex items-center justify-center h-6 w-6 overflow-hidden">
              {company?.assignedFirmLogo ? (
                <img
                  src={company?.assignedFirmLogo}
                  alt={`${company?.assignedFirmName} Logo`}
                />
              ) : (
                <div className="p-1 text-sm">{initials}</div>
                // <ArrowUpCircleIcon />
              )}
            </div>
            <div className="truncate">{company?.assignedFirmName}</div>
          </div>
          <div className="justify-self-end md:hidden pr-2">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-col justify-between border-r flex-1">
          <div className="px-4 overflow-hidden">
            {/* Mobile header with current step and menu button */}
            <div className="md:hidden flex items-center justify-between p-3 rounded-md mb-4 bg-card shadow-sm">
              <SheetTrigger
                className="p-2 rounded-md outline bg-background"
                aria-label="Toggle progress menu"
              >
                <MenuIcon className="w-5 h-5" />
                <span className="sr-only">
                  Toggle onboarding navigation menu
                </span>
              </SheetTrigger>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm">
                  {currentStepObj && (
                    <currentStepObj.icon className="h-4 w-4" />
                  )}
                </div>
                <span className="text-sm">{currentStepObj?.title}</span>
                <span className="text-xs text-gray-500">
                  Step {currentIndex + 1} of {steps.length}
                </span>
              </div>
            </div>

            {isMobile ? (
              <SheetContent side="left" className="p-4">
                <SheetHeader className="px-0">
                  <SheetTitle>Onboarding Steps</SheetTitle>
                  <SheetDescription className="hidden">
                    Progress menu
                  </SheetDescription>
                </SheetHeader>
                {renderedSteps}
                <OnboardingFormFooter />
              </SheetContent>
            ) : (
              renderedSteps
            )}
          </div>
          {!isMobile && <OnboardingFormFooter />}
        </div>
      </div>
    </>
  );
}
