import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { CenteredLoader } from "@/components/CenteredLoader";
import { routes } from "@/shared/routes/routes";
import { useSession } from "@/features/auth/Session";
import { getPathByStepKey } from "@/features/onboarding/utils";
import ErrorPage from "@/components/ErrorPage";

export function OnboardingRouter() {
  /**
   * On signup or login, we navigate here
   * This component then determines if the user is onboarded or not and redirects accordingly.
   * If not onboarded, it redirects to the relevant step in the onboarding flow.
   */

  const { user, isLoggedIn, loading, onboarding } = useSession();
  const [params] = useSearchParams();
  const location = useLocation();

  const userIdFromUrl = params.get("userId");
  const verificationToken = params.get("token");
  const mightBeVerificationPath = location.pathname.includes("verify-email");

  const hasTokenVerificationParams = !!verificationToken && !!userIdFromUrl;

  console.log(onboarding);

  if (loading) {
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

  if (onboarding?.canAccessApp) {
    return <Navigate to={routes.general.dashboard.staticPath} replace />;
  }

  if (!onboarding?.nextStepToComplete) {
    return <ErrorPage />;
  }

  const nextStepPath = getPathByStepKey(onboarding.nextStepToComplete);

  if (!nextStepPath) {
    return <ErrorPage />;
  }

  return (
    <Navigate
      to={routes.onboarding.step.build({ step: nextStepPath })}
      replace
    />
  );
}
