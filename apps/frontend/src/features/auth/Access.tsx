import { CenteredLoader } from "@/components/CenteredLoader";
import { useSession } from "@/features/auth/Session";
import { routes } from "@/shared/routes/routes";
import { isPublicRoute } from "@/shared/routes/utils";
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RootRedirector() {
  const { loading, companyId, hasAppAccess } = useSession();
  // Public page, do nothing
  if (isPublicRoute(window.location.pathname)) {
    return null;
  }

  if (loading) {
    return <CenteredLoader fullscreen message="Loading..." />;
  }

  if (!hasAppAccess) {
    // No company selected, redirect to company selection or onboarding
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  // Otherwise, redirect to tenant dashboard
  if (location.pathname === "/") {
    return (
      <Navigate to={routes.general.dashboard.build({ companyId })} replace />
    );
  }

  return null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoggedIn, loading } = useSession();

  if (loading) return <CenteredLoader fullscreen />;

  if (!isLoggedIn || !user) {
    return <Navigate to={routes.auth.login.staticPath} replace />;
  }

  return <>{children}</>;
}

export function RequireOnboardingComplete({
  children,
}: {
  children: React.ReactNode;
}) {
  const { onboarding } = useSession();

  if (!onboarding?.canAccessApp) {
    return <Navigate to={routes.onboarding.index.staticPath} replace />;
  }

  return <>{children}</>;
}

export function RequireCurrentCompanyIsFirm({
  children,
}: {
  children: React.ReactNode;
}) {
  const { companyType, companyId } = useSession();

  const isAccountingFirm = companyType === "accounting_firm";

  if (!isAccountingFirm) {
    return (
      <Navigate to={routes.general.dashboard.build({ companyId })} replace />
    );
  }

  return <>{children}</>;
}
