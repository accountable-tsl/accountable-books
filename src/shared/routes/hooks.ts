import { useAuth } from "@/features/auth/hooks";
import { useEffect, useMemo, useRef } from "react";
import { matchPath, useLocation } from "react-router-dom";
import {
  buildCanonicalUrl,
  enforceCanonicalUrl,
  isPublicRoute,
} from "@/shared/routes/utils";
import { routes } from "@/shared/routes/routes";
import { RouteKey } from "@/shared/routes/types";
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
 * Hook to enforce canonical URL redirection for logged-in users.
 * Matches the current pathname to a routeKey and redirects if needed.
 * Should be called at app or layout level
 */
export function useCanonicalUrlEnforcer(): void {
  const location = useLocation();
  const { user } = useAuth();
  const hasRedirectedRef = useRef(false);

  function enforceIfNeeded() {
    if (!user || hasRedirectedRef.current) return;

    const matchedRouteEntry = Object.entries(routes).find(([_, config]) => {
      const pattern = config.staticPath;
      return matchPath({ path: pattern, end: true }, location.pathname);
    });

    if (!matchedRouteEntry) return;

    const [routeKey, routeConfig] = matchedRouteEntry;

    // Extract dynamic segments using regex
    const match = matchPath(
      { path: routeConfig.staticPath, end: true },
      location.pathname
    );

    const routeParams = match?.params ?? {};

    // Remove companyId — already passed via user.currentCompanyId
    const routeArgs = Object.entries(routeParams)
      .filter(([key]) => key !== "companyId")
      .map(([, val]) => val ?? "");

    const canonicalUrl = buildCanonicalUrl({
      user,
      routeKey: routeKey as RouteKey,
      routeArgs,
    });
    const canonical = new URL(canonicalUrl);

    const needsRedirect =
      window.location.hostname !== canonical.hostname ||
      window.location.pathname !== canonical.pathname;

    if (needsRedirect) {
      hasRedirectedRef.current = true;
      enforceCanonicalUrl(user, routeKey as RouteKey, routeArgs);
    }
  }

  useEffect(() => {
    enforceIfNeeded();
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
