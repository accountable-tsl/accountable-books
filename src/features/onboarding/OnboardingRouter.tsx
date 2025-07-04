import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { CenteredLoader } from "@/components/CenteredLoader";
import { routes } from "@/shared/routes/routes";
import { useSession } from "@/features/auth/Session";

export function OnboardingRouter() {
  /**
   * On signup or login, we navigate here
   * This component then determines if the user is onboarded or not and redirects accordingly.
   * If not onboarded, it redirects to the relevant step in the onboarding flow.
   */

  const { user, isLoggedIn, loading } = useSession();
  const [params] = useSearchParams();
  const location = useLocation();

  const userIdFromUrl = params.get("userId");
  const verificationToken = params.get("token");
  const mightBeVerificationPath = location.pathname.includes("verify-email");

  const hasTokenVerificationParams = !!verificationToken && !!userIdFromUrl;

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

  if (user?.currentCompany.onboarding.nextStepToComplete === "email_verified") {
    return <Navigate to={routes.onboarding.verifyEmail.staticPath} replace />;
  }
}
