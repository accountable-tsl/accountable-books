import { useSession } from '@session';
import { useLocation } from 'react-router';

import { flatRoutes, routeIndex } from '../routes/registry';
import { findMatchingRouteSmart } from '../routes/utils';

/**
 * Extract param values from a URL suffix by matching against a route pattern.
 * e.g. extractRouteParams('/dashboard/:tab', '/dashboard/balance') → { tab: 'balance' }
 */
function extractRouteParams(
  staticPath: string,
  suffixPath: string,
): Record<string, string> {
  const patternParts = staticPath.split('/').filter(Boolean);
  const pathParts = suffixPath.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length && i < pathParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    }
  }
  return params;
}

export function useBreadcrumbs() {
  const location = useLocation();
  const { user } = useSession();
  const companyId = user?.currentCompanyId;
  const pathname = location.pathname;

  const matchedEntry = findMatchingRouteSmart(routeIndex, pathname);
  if (!matchedEntry) return [];

  const { key: matchedKey } = matchedEntry;

  const parts = matchedKey.split('.');
  const breadcrumbKeys = parts.reduce<string[]>((acc, _, index) => {
    acc.push(parts.slice(0, index + 1).join('.'));
    return acc;
  }, []);

  const HOME_KEY = 'general.home';
  if (!breadcrumbKeys.includes(HOME_KEY)) {
    breadcrumbKeys.unshift(HOME_KEY);
  }

  // Extract suffix path (without companyId) for param extraction
  const segments = pathname.split('/').filter(Boolean);
  const suffixPath =
    segments.length > 1 ? '/' + segments.slice(1).join('/') : pathname;

  const rawBreadcrumbs = breadcrumbKeys
    .map((key) => {
      const route = flatRoutes[key];
      if (!route || route.meta?.hideInBreadcrumb) return null;

      const label = route.meta?.label;
      const routeParams = extractRouteParams(route.staticPath, suffixPath);
      const link = route.build
        ? route.build({ companyId, ...routeParams })
        : '#';

      return { label, link };
    })
    .filter(Boolean) as { label: string; link: string }[];

  const seen = new Set<string>();
  const breadcrumbs = rawBreadcrumbs.filter((item) => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  });

  return breadcrumbs;
}
