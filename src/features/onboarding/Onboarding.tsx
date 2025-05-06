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

/*
 * Steps (Direct Signup)
 * companyType === business or accounting_firm, Verify Email, Company Vitals, Company Details, Add Bank Account, Miscellaneous -- End
 * companyType === individual, Verify Email, Add Bank Account, Miscellaneous -- End
 * Handle Later, Invited user, Verify Email, Miscellaneous -- End
 *
 *
 * Notes
 * Show steps based on user path, confirm user is creator by checking that user.id === company.createdById
 * If user is not creator, show message asking them to contact creator or get help
 */

export function OnboardingForm() {
  const { company, companyId, companyType } = useCompany();
  const { user, isLoggedIn } = useAuth();
  const isMobile = useIsMobile();
  if (!companyType || !company) return null;
  return (
    <>
      {!isMobile ? (
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
            {/* <DialogContent className="w-full max-w-4xl min-h-[400px] max-h-[90vh] max-w-[90vw] overflow-y-auto p-6 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[85vh]"> */}
            <DialogContent className="[&>button]:hidden h-fit min-h-[70vh] min-w-[85vw] max-w-[90vw] overflow-y-auto p-0">
              <div className="flex">
                {/* // md:w-1/4 w-full */}
                <div className="w-[20rem] bg-card shadow-md overflow-hidden flex flex-col justify-between">
                  <OnboardingSidebar
                    company={company}
                    companyType={companyType}
                    isCreator={user.id === company?.createdById}
                    currentStep="companyVitals"
                  />
                  <OnboardingFormFooter />
                </div>

                <div className="flex flex-col flex-1">
                  <OnboardingHeader />
                  <VerifyEmail />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <Sheet>
          <div className="flex flex-col h-dvh overflow-hidden">
            <OnboardingSidebar
              company={company}
              companyType={companyType}
              isCreator={user.id === company?.createdById}
              currentStep="companyVitals"
              footer={<OnboardingFormFooter />}
            />
            <VerifyEmail />
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
