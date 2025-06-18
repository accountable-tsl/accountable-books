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
import { useCallback, useEffect, useMemo, useState } from "react";
import { isStepAllowed, stepMap } from "./utils";
import { CompanyInfo } from "@/features/onboarding/steps/CompanyInfo";
import { BankAccount } from "@/features/onboarding/steps/BankAccount";
import { Miscellaneous } from "@/features/onboarding/steps/Miscellaneous";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  OnboardingSideBarProps,
  onboardingSteps,
  OnboardingSteps,
} from "@/features/onboarding/types";
import { CenteredLoader } from "@/components/CenteredLoader";
import { onboardingStatus, OnboardingStatus } from "@/domains/company/types";
import { getCompanyDetails } from "@/domains/company/api";
import { routes } from "@/shared/routes/routes";

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
  const [isLoading, setIsLoading] = useState(true);

  // Computed
  const status = useMemo<OnboardingStatus>(
    () => company?.onboardingStatus ?? "not_started",
    [company?.onboardingStatus]
  );

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

  // Callbacks
  const handleStatusChange = useCallback(
    (s: OnboardingStatus) => setOnboardingStatus(s),
    [setOnboardingStatus]
  );

  const fetchCompanyData = useCallback(async () => {
    const id = companyId || company?.id;
    if (!user?.id || !id) return;

    try {
      const res = await getCompanyDetails(id);
      if (res.success && res.data) {
        setCompany(res.data);
      } else {
        toast.error(res.message || "Failed to fetch company data");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    }
  }, [user?.id, companyId, company?.id, setCompany]);

  // Effects
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const loadData = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      await fetchCompanyData();
      setIsLoading(false);

      const id = companyId || company?.id;
      if (id) {
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
    return {
      company,
      currentStep: step as keyof typeof onboardingSteps,
      isCreator,
    };
  }, [company, user, step, isCreator]);

  const stepElement = useMemo(() => {
    switch (step) {
      case "verifyEmail":
        return <VerifyEmail onStatusChange={handleStatusChange} />;
      case "companyVitals":
        return <CompanyInfo />;
      case "addBankAccount":
        return <BankAccount key="addBankAccount" />;
      case "miscellaneous":
        return <Miscellaneous />;
      default:
        return null;
    }
  }, [step, handleStatusChange]);

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
          <DialogContent className="flex [&>button]:hidden h-fit min-h-[70vh] max-h-[80vh] min-w-[85vw] max-w-[90vw] overflow-hidden p-0 gap-0">
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
          <span>See the platform in action</span> <ScreenShareIcon size={14} />
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
