import { CenteredLoader } from "@/components/CenteredLoader";
import { useAuth, useSessionLoader } from "@/features/auth/hooks";
import { routes } from "@/shared/routes/routes";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthUserContext } from "../auth/types";
import { OnboardingResolution, OnboardingStep } from "./types";
import { onboardingStepToSlug } from "@/features/onboarding/utils";

export default function OnboardingRouter() {
  /**
   * On signup or login, we navigate here
   * This component then determines if the user is onboarded or not and redirects accordingly.
   * If not onboarded, it redirects to the relevant step in the onboarding flow.
   */

  const { user, isLoggedIn } = useAuth();
  const { loading: sessionLoading } = useSessionLoader();
  const [params] = useSearchParams();
  const location = useLocation();

  const userIdFromUrl = params.get("userId");
  const verificationToken = params.get("token");
  const mightBeVerificationPath = location.pathname.includes("verify-email");

  const hasTokenVerificationParams = !!verificationToken && !!userIdFromUrl;

  if (sessionLoading) {
    return (
      <CenteredLoader
        fullscreen
        message="Loading..."
        showAuthHeader={!isLoggedIn}
      />
    );
  }

  if (!isLoggedIn || !user) {
    // If user is not logged in & there are verification params or might be verification path, redirect to verify email
    if (hasTokenVerificationParams || mightBeVerificationPath) {
      return <Navigate to={routes.onboarding.verifyEmail.staticPath} replace />;
    }
    return <Navigate to={routes.auth.login.staticPath} replace />;
  }

  if (user?.currentCompany.onboarding.nextStepToComplete === "email_verified") {
    return <Navigate to={routes.onboarding.verifyEmail.staticPath} replace />;
  }
  
  const resolution = resolveOnboardingRoute(user);
  console.log("resolution", resolution);

  switch (resolution.type) {
    case "accessGranted":
      return (
        <Navigate
          to={routes.general.dashboard.build({
            companyId: user.currentCompany.id,
          })}
          replace
        />
      );

    case "redirect":
      return <Navigate to={resolution.path} replace />;

    case "blocked":
      return (
        <BlockedOnboardingPage
          reason={resolution.reason}
          steps={resolution.steps}
        />
      );
  }
}

function BlockedOnboardingPage({
  reason,
  steps,
}: {
  reason: "notCompanyOwner" | "unknownError";
  steps: OnboardingStep[];
}) {
  console.log(reason, steps);

  return <>Blocked</>;
}

export function resolveOnboardingRoute(
  user: AuthUserContext
): OnboardingResolution {
  const { currentCompany } = user;
  const onboarding = currentCompany.onboarding;
  const steps = onboarding.steps;

  //Platform users or demo companies always get access
  if (user.isPlatformUser || currentCompany.isDemoCompany) {
    return {
      type: "accessGranted",
      steps,
    };
  }

  // Backend says user can access app
  if (onboarding.canAccessApp) {
    return {
      type: "accessGranted",
      steps,
    };
  }

  // If user steps are complete but company is not
  if (onboarding.userStepsComplete && !onboarding.canAccessApp) {
    return {
      type: "blocked",
      reason: onboarding.isCompanyOwner ? "unknownError" : "notCompanyOwner",
      steps,
    };
  }

  const nextStep = onboarding.nextStepToComplete;

  // Defensive step resolution
  const expectedNext = steps
    .filter((s) => !s.complete && !s.blocked)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];

  if (expectedNext?.key !== onboarding.nextStepToComplete) {
    console.warn("Backend inconsistency detected in onboarding state", {
      nextStepToComplete: onboarding.nextStepToComplete,
      expectedStep: expectedNext?.key,
    });
    // Prefer to trust the backend's `nextStepToComplete`, but log it
  }

  if (!nextStep) {
    // Defensive fallback: no step specified and no access
    return {
      type: "blocked",
      reason: onboarding.isCompanyOwner ? "unknownError" : "notCompanyOwner",
      steps,
    };
  }

  const path = onboardingStepToSlug[nextStep];
  if (!path) {
    return {
      type: "blocked",
      reason: "unknownError",
      steps,
    };
  }

  return {
    type: "redirect",
    path,
    steps,
  };
}
