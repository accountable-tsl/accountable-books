import { useEffect, useMemo, useRef } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { buildCanonicalUrl, flatRoutes } from '@/shared/routes/utils';
import { useSession } from '@/features/auth/Session';
import { routes } from '@/shared/routes/routes';
export function useRoutePath<T extends Record<string, any>>(
  route: { buildPath: (params?: T) => string },
  params?: T,
) {
  return useMemo(
    () => route.buildPath(params),
    [
      route,
      // Stringify params to ensure deep comparison
      JSON.stringify(params),
    ],
  );
}

/**
 * Hook to enforce canonical URL redirection for logged-in users.
 * Matches the current pathname to a routeKey and redirects if needed.
 * Should be called at app or layout level
 */
export function useCanonicalUrlEnforcer(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirectedRef = useRef(false);
  const { user, loading } = useSession();

  useEffect(() => {
    if (!user || loading || hasRedirectedRef.current) return;

    // Loop through flatRoutes to find a match, recall (dot-separated keys e.g "auth.login")
    for (const [routeKey, route] of Object.entries(flatRoutes)) {
      const match = matchPath({ path: route.staticPath, end: true }, location.pathname);

      if (!match) continue; // No match for this route

      // Extract all dynamic segments from the URL (e.g. { companyId: 'abc123', reportId: 'xyz' })
      // -------------------------------
      // Example: if URL is "/dashboard?tab=summary"
      // match.params might return: {}
      // if URL is "/companies/:companyId/reports/:reportId"
      // match.params => { companyId: "123", reportId: "abc" }
      // -------------------------------
      const fullParams = match.params ?? {};

      // Don't pass companyId to builder — it's derived from user context
      const { companyId, ...restParams } = fullParams;

      let canonicalUrl: string | undefined;

      try {
        canonicalUrl = buildCanonicalUrl({
          user,
          routeKey, // e.g., "general.dashboard"
          routeParams: restParams, // Params other than companyId
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('Failed to build canonical URL:', error);
        }

        // Redirect to login
        navigate(routes.auth.login.staticPath, { replace: true });
        return;
      }

      const canonical = new URL(canonicalUrl);

      // -------- CURRENT URL --------
      const currentHost = window.location.host; // e.g. "app.getaccountable.com"
      const currentPath = location.pathname; // e.g. "/dashboard"
      const currentSearch = location.search; // e.g. "?tab=summary"

      // -------- CANONICAL URL (Expected) --------
      const canonicalHost = canonical.host; // e.g. "firmslug.getaccountable.com"
      const canonicalPath = canonical.pathname; // e.g. "/dashboard"

      // -------- Determine mismatches --------
      const domainMismatch = currentHost !== canonicalHost;
      const pathMismatch = currentPath !== canonicalPath;

      if (domainMismatch) {
        hasRedirectedRef.current = true;

        // Force full-page reload to correct domain
        window.location.replace(canonical.href);
        return;
      }

      if (pathMismatch) {
        hasRedirectedRef.current = true;

        // Client-side SPA navigation
        navigate(canonical.pathname + currentSearch, { replace: true });
        return;
      }

      return;
    }
  }, [location.pathname, location.search, user, loading, navigate]);
}
