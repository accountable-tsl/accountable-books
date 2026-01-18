import { useSession } from '@session';
import { Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';

import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { MockSidebar } from '@/components/SideBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { OnboardingHeader } from '@/domains-pending-migration/onboarding/shared/Header';
import {
  MobileOnboardingSidebar,
  OnboardingSidebar,
} from '@/domains-pending-migration/onboarding/shared/Sidebar';
import type {
  EnrichedOnboardingStep,
  OnboardingState,
} from '@/domains-pending-migration/onboarding/types';
import type { OnboardingPathKey } from '@/domains-pending-migration/onboarding/utils';
import {
  getPathByStepKey,
  onboardingSteps,
  onboardingStepsConfig,
} from '@/domains-pending-migration/onboarding/utils';
import { cn } from '@/lib/utils';
import type { CompanyData } from '@/modules/company/companies';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { routes } from '@/shared/routes/routes';

export function OnboardingStepPage() {
  const {
    isLoggedIn,
    loading: sessionLoading,
    company,
    onboarding: onboardingState,
  } = useSession();

  const { step: stepParam } = useParams<{ step?: string }>();
  const pathname = useLocation().pathname;

  const step = (
    stepParam && stepParam !== ':step' && stepParam !== 'step'
      ? stepParam
      : Object.keys(onboardingSteps).find((key) => pathname.endsWith(`/${key}`))
  ) as OnboardingPathKey | undefined;

  // if(!onboardingState?.nextStepToComplete){}

  const stepInfo = step ? onboardingSteps[step] : undefined;
  const stepKey = stepInfo?.key;

  if (!stepKey) {
    return <ErrorPage type="default" />;
  }

  if (sessionLoading) {
    return (
      <CenteredLoader
        fullscreen
        message="Loading..."
        showAuthHeader={isLoggedIn}
      />
    );
  }

  console.log({ stepInfo, stepKey });

  const StepComponent = stepInfo?.Component;
  if (!StepComponent) return <ErrorPage type="default" />;
  if (!isLoggedIn || stepKey === 'email_verified') return <StepComponent />;

  if (!onboardingState || !company || !onboardingState.nextStepToComplete) {
    return <ErrorPage type="default" />;
  }

  const expectedStep = getPathByStepKey(onboardingState.nextStepToComplete);

  if (expectedStep && step !== expectedStep) {
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
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
  const showSidebar = nextStep !== 'email_verified';
  const sidebarWidth = '250px';
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
    [onboardingSteps, currentStep],
  );

  const currentStepObj = useMemo(
    () => steps.find((step) => step.key === currentStep),
    [steps, currentStep],
  );

  const currentStepIndex = useMemo(
    () => steps.findIndex((step) => step.key === currentStep),
    [steps, currentStep],
  );

  // Close the sidebar when the escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileSidebarOpen(false);
    };
    if (mobileSidebarOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [mobileSidebarOpen]);

  // Prevent scrolling when the sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
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
            'z-10 w-full',
            !isMobile
              ? 'absolute inset-0 flex items-center justify-center bg-black/70'
              : mobileSidebarOpen
                ? 'absolute inset-0 bg-black/70'
                : 'relative',
          )}
        >
          {/* Onboarding Box */}
          <div className="bg-background flex h-[100vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border md:h-fit md:max-h-[85vh] md:min-h-[50vh]">
            {/* Sidebar (progress tracker) — only on desktop */}

            <OnboardingHeader
              firmName={company?.assignedFirmName ?? ''}
              logoUrl={company?.assignedFirmLogo ?? ''}
              className="bg-background sticky top-0 z-10 border-b"
              sidebarWidth={sidebarWidth}
              showSidebar={showSidebar}
            />
            <div
              className={cn(
                'flex flex-1 overflow-hidden',
                isMobile ? 'flex-col' : '',
              )}
            >
              {showSidebar && !isMobile && (
                <div
                  className={cn(
                    sidebarWidth ? `w-[${sidebarWidth}]` : 'w-[250px]',
                    'flex border-r',
                  )}
                >
                  <OnboardingSidebar steps={steps} />
                </div>
              )}

              {/* Mobile header with current step and menu button */}
              {isMobile && (
                <div className="bg-card m-4 mb-4 flex items-center justify-between rounded-md p-3 shadow-sm">
                  <div
                    className="bg-background rounded-md p-2 outline"
                    onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                    aria-expanded={mobileSidebarOpen}
                    aria-controls="mobile-onboarding-sidebar"
                  >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">
                      Toggle onboarding navigation menu
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-muted flex h-7 w-7 items-center justify-center rounded-full text-sm">
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
              <div className="scrollbar-thin-2px relative flex flex-1 overflow-y-auto py-2">
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
