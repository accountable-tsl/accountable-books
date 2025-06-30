import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/domains/company/store";
import { useAuth } from "../auth/hooks";
import { OnboardingSidebar } from "@/features/onboarding/shared/Sidebar";
import { MockDashboard } from "../dashboard/MockDashboard";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { Sheet } from "@/components/ui/sheet";
import { OnboardingHeader } from "@/features/onboarding/shared/Header";
import { HeadsetIcon, ScreenShareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VerifyEmail } from "./steps/VerifyEmail";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isStepAllowed, onboardingStepToSlug, stepMap } from "./utils";
import { CompanyInfo } from "@/features/onboarding/steps/CompanyInfo";
import { BankAccount } from "@/features/onboarding/steps/BankAccount";
import { Miscellaneous } from "@/features/onboarding/steps/Miscellaneous";
import { toast } from "sonner";
import { matchPath, useNavigate, useParams } from "react-router-dom";
import {
  OnboardingSideBarProps,
  OnboardingStepKey,
  onboardingSteps,
  OnboardingSteps,
} from "@/features/onboarding/types";
import { CenteredLoader } from "@/components/CenteredLoader";
import { onboardingStatus, OnboardingStatus } from "@/domains/company/types";
import { getCompanyDetails } from "@/domains/company/api";
import { routes } from "@/shared/routes/routes";
import { useCompanySwitch } from "../switchCompany/hooks";
import { DEMO_COMPANIES_IDS } from "@/domains/company/constants";
import ErrorPage from "@/components/ErrorPage";

export const onboardingStepComponentMap: Record<
  OnboardingStepKey,
  JSX.Element
> = {
  email_verified: <VerifyEmail />,
  company_details_confirmed: <CompanyInfo />,
  first_bank_account_added: <BankAccount />,
};

export function OnboardingStepPage() {
  const { step } = useParams<{ step: string }>();

  // Find the matching key by comparing step parameters
  const stepKey = Object.entries(onboardingStepToSlug).find(([key, route]) => {
    const match = matchPath(routes.onboarding.step.staticPath, route);
    return match?.params.step === step;
  })?.[0] as keyof typeof onboardingStepToSlug | undefined;

  if (!step || !stepKey) {
    return <ErrorPage type="default" />;
  }

  const StepComponent = onboardingStepComponentMap[stepKey];

  return StepComponent ?? <ErrorPage type="default" />;
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

const StableDialog = ({ children }: { children: React.ReactNode }) => {
  const [isOpen] = useState(true);

  return <Dialog open={isOpen}>{children}</Dialog>;
};

const OnboardingFormFooter = () => {
  const isMobile = useIsMobile();
  const { logout } = useAuth();
  const { companyType } = useCompany();
  const { switchCompany } = useCompanySwitch();

  const handleDemoCompanyAccess = () => {
    if (!companyType) {
      toast.error("We are sorry, Demo company is not available at this time.");
      return;
    }

    const demoCompany = DEMO_COMPANIES_IDS[companyType];
    switchCompany({ companyId: demoCompany });
  };

  return (
    <div className="flex flex-col items-center gap-2 mb-4 md:mb-8">
      {isMobile && (
        <span className="text-center text-foreground/70 text-xs">
          For a better experience, view on larger screen
        </span>
      )}
      {!isMobile && (
        <div
          className={cn(
            "text-sm hover:underline flex gap-1 text-muted-foreground hover:text-foreground cursor-pointer",
            "flex items-center gap-1",
            isMobile ? "font-medium underline text-foreground" : ""
          )}
        >
          <span onClick={handleDemoCompanyAccess}>
            See the platform in action
          </span>{" "}
          <ScreenShareIcon size={14} />
          {/* <span className={cn("font-medium cursor-pointer")}>Demo Company</span> */}
        </div>
      )}
      <div className="flex flex-col">
        <Button variant={"outline"} size={"sm"}>
          <HeadsetIcon size={14} />
          <span className="font-light text-xs">Contact support</span>
        </Button>
        <Button
          variant="link"
          size={"sm"}
          className="text-xs text-muted-foreground h-6"
          onClick={() => logout()}
        >
          Logout
        </Button>
      </div>
    </div>
  );
};

// OnboardingForm.whyDidYouRender = true;
