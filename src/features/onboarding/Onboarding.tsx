import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompany } from "@/domains/company/store";
import { useAuth } from "../auth/hooks";
import { OnboardingSidebar } from "./OnboardingSidebar";
import { MockDashboard } from "../dashboard/MockDashboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet } from "@/components/ui/sheet";
import { OnboardingHeader } from "./OnboardingHeader";
import { HeadsetIcon, ScreenShareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VerifyEmail } from "./steps/VerifyEmail";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isStepAllowed, stepMap } from "./utils";
import { CompanyInfo } from "./steps/CompanyInfo";
import { BankAccount } from "./steps/BankAccount";
import { Miscellaneous } from "./steps/Miscellaneous";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { OnboardingSteps } from "./types";
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
  const { user, isLoggedIn } = useAuth();

  // State
  // const [status, setStatus] = useState<OnboardingStatus>("not_started");
  const status: OnboardingStatus = company?.onboardingStatus ?? "not_started";
  const [isLoading, setIsLoading] = useState(true);

  // Computed
  const currentStep: OnboardingSteps = stepMap[status] || "verifyEmail";
  const step: OnboardingSteps =
    overrideStep && isStepAllowed(overrideStep, status)
      ? overrideStep
      : currentStep;

  const isMinimalStep =
    step === "verifyEmail" && (!isLoggedIn || !company || !companyType);

  const shouldBlockRender =
    isLoading || (!isMinimalStep && (!company || !companyType || !step));

  // The sidebar uses this data to determine which steps to show
  const sidebarProps = useMemo(() => {
    if (!company || !user) return null;
    return {
      company,
      currentStep: step,
    };
  }, [company, user, step]);

  const handleStatusChange = (s: OnboardingStatus) => setOnboardingStatus(s);

  // Components
  const stepElement = useMemo(() => {
    switch (step) {
      case "verifyEmail":
        return <VerifyEmail onStatusChange={handleStatusChange} />;
      case "companyVitals":
        return <CompanyInfo />;
      case "addBankAccount":
        return <BankAccount />;
      case "miscellaneous":
        return <Miscellaneous />;
      default:
        return null;
    }
  }, [step, handleStatusChange]);

  // Functions
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
  }, [user?.id, companyId, setCompany]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      await fetchCompanyData();
      setIsLoading(false);
    };
    load();

    const id = companyId || company?.id;
    if (!user?.id || !id) return;
    const intervalId = setInterval(fetchCompanyData, 5000);

    return () => clearInterval(intervalId);
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
  }, [overrideStep, status, navigate, currentStep]);

  if (shouldBlockRender) return <CenteredLoader />;

  return (
    <>
      {/* No fancy UI if user is not logged in */}
      {isMinimalStep ? (
        <div className="p-6">{stepElement}</div>
      ) : !isMobile ? (
        <div>
          <MockDashboard />

          <Dialog open={true}>
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
          </Dialog>
        </div>
      ) : (
        <Sheet>
          <div className="flex flex-col h-dvh overflow-hidden">
            {sidebarProps && <OnboardingSidebar {...sidebarProps} />}
            {stepElement}
          </div>
        </Sheet>
      )}
    </>
  );
}

const OnboardingFormFooter = () => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col items-center gap-2 mb-4 md:mb-8">
      {isMobile && (
        <span className="text-center text-foreground/70 text-xs">
          For a better experience, view on larger screen
        </span>
      )}
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
      <Button variant={"outline"} size={"sm"}>
        <HeadsetIcon size={14} />
        <span className="font-light text-xs">Contact support</span>
      </Button>
    </div>
  );
};
