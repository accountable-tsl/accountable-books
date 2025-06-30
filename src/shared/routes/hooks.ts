import { useAuth } from "@/features/auth/hooks";
import { useEffect, useMemo, useRef } from "react";
import { matchPath, useLocation } from "react-router-dom";
import {
  buildCanonicalUrl,
  createTenantRoutes,
  enforceCanonicalUrl,
  flatRoutes,
  isPublicRoute,
} from "@/shared/routes/utils";
import { routes } from "@/shared/routes/routes";
import {
  ExtractPathParams,
  FlattenedRouteKey,
  OmitCompanyId,
} from "@/shared/routes/types";
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

    // Loop through flatRoutes to find a match, recall (dot-separated keys e.g "auth.login")
    for (const [routeKey, route] of Object.entries(flatRoutes)) {
      const match = matchPath(
        { path: route.staticPath, end: true },
        location.pathname
      );

      if (!match) continue; // No match for this route

      // Extract all dynamic segments from the URL (e.g. { companyId: 'abc123', reportId: 'xyz' })
      const fullParams = match.params ?? {};

      // Remove companyId since the routing engine will inject it automatically from user context
      const { companyId, ...rest } = fullParams;

      enforceCanonicalUrl(
        user,
        routeKey as FlattenedRouteKey,
        rest as OmitCompanyId<
          ExtractPathParams<(typeof flatRoutes)[typeof routeKey]["staticPath"]>
        >
      );

      hasRedirectedRef.current = true;
      break;
    }
  }

  useEffect(() => {
    enforceIfNeeded();
  }, [location.pathname, user]);
}

export function useTenantRoutes() {
  const { user } = useAuth();

  const companyId = user?.currentCompanyId;
  if (!companyId) {
    throw new Error("No currentCompanyId found in user context");
  }

  const tenantRouter = useMemo(
    () => createTenantRoutes(routes, companyId),
    [companyId]
  );

  return tenantRouter;
}
