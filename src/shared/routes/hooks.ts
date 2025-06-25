import { useAuth } from "@/features/auth/hooks";
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { enforceCanonicalUrl, isPublicRoute } from "@/shared/routes/utils";
import { routes } from "@/shared/routes/routes";
import Dashboard from "@/features/dashboard/Dashboard";
export function useRoutePath<T extends Record<string, any>>(
  route: { buildPath: (params?: T) => string },
  params?: T
) {
  return useMemo(
    () => route.buildPath(params),
    [
      route,
      // Stringify params to ensure deep comparison
      JSON.stringify(params),
    ]
  );
}

/**
 * Hook that enforces canonical URL on route changes.
 * Should be called at app or layout level
 */

export function useCanonicalUrlEnforcer(): void {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      enforceCanonicalUrl(user);
    }
  }, [location.pathname, user]);
}

export const useTenantRoutes = () => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user && !isPublicRoute(location.pathname)) {
    throw new Error("No user context");
  }
  const companyId = user?.currentCompanyId || "";
  return {
    home: () => routes.home.path(companyId),
    homeAlias: () => routes.homeAlias.path(companyId),
    dashboard: () => routes.homeAlias.path(companyId),

    login: () => routes.login.path(),
    logout: () => routes.logout.path(),
    signup: () => routes.signup.path(),
    forgotPassword: () => routes.forgotPassword.path(),

    onboarding: () => routes.onboarding.path(),
    verifyEmail: () => routes.verifyEmail.path(),
    welcome: () => routes.welcome.path(companyId),

    catEngine: () => routes.catEngine.path(companyId),

    // invoiceDetail: (invoiceId: string) =>
    //   tenantRoutes.invoiceDetail.path(companyId, invoiceId),
  };
};
