import { matchPath } from 'react-router';

import { routes } from './routes';
import {
  buildSmartIndex,
  flatRoutesForCanonicalUrls,
  flattenRoutes,
} from './utils';

import type {
  BuildCanonicalUrlOptions,
  FlattenedRouteKey,
  RouteLike,
} from './types';

export const flatRoutes = flatRoutesForCanonicalUrls(routes);
export const routeIndex = buildSmartIndex(flatRoutes);

const flattenedRoutes = flattenRoutes(routes);
const flattenedPublicRoutes = flattenedRoutes.filter((r) => r.meta?.public);

export function matchRouteForPath(path: string): RouteLike | undefined {
  return flattenedRoutes.find((route) =>
    matchPath({ path: route.staticPath, end: true }, path),
  );
}

export function isPublicRoute(path: string): boolean {
  return flattenedPublicRoutes.some((route) =>
    matchPath({ path: route.staticPath, end: true }, path),
  );
}

/**
 * Builds a full canonical URL for a given route and user context.
 *
 * Automatically injects `companyId` if the route requires it, and constructs
 * a type-safe URL using the user's assigned firm subdomain in production,
 * or the current browser origin in development.
 *
 * @example
 * buildCanonicalUrl({
 *   user,
 *   routeKey: "dashboard.report",
 *   routeParams: { reportId: "abc123" },
 * });
 * // https://firmSlug.getaccountable.com/companyId/report/abc123
 *
 * @template K - A valid route key from the flattened routes map
 * @param options - Includes the user context, route key, params (excluding companyId), and optional origin override
 * @returns The full URL string
 * @throws If the company is not found or the route is invalid
 */
export function buildCanonicalUrl<K extends FlattenedRouteKey>({
  user,
  routeKey,
  routeParams,
  origin,
}: BuildCanonicalUrlOptions<K>): string {
  const route = flatRoutes[routeKey];
  if (!route) {
    const availableKeys = Object.keys(flatRoutes).join(', ');
    throw new Error(
      `Route key "${routeKey}" not found. Available keys: ${availableKeys}`,
    );
  }

  const { currentCompanyId, companies } = user;
  const company = companies.find((c) => c.id === currentCompanyId);
  if (!company) throw new Error('Current company not found in user data');

  const firmSlug = company.assignedFirmSlug;

  const needsCompanyId = route.meta.requiresCompanyId ?? true;

  const params = needsCompanyId
    ? { companyId: currentCompanyId, ...(routeParams as object) }
    : routeParams;

  const fullPath = route.build(params as any);

  const normalizedPath =
    fullPath === '' ? '' : fullPath.startsWith('/') ? fullPath : `/${fullPath}`;

  // Use 'app' as default subdomain when no firm is assigned
  const subdomain = firmSlug || 'app';

  // Determine the base domain based on environment
  const getBaseDomain = () => {
    if (import.meta.env.PROD) {
      return 'getaccountable.com';
    }
    // Check if we're on staging
    if (window.location.hostname.includes('staging.getaccountable.com')) {
      return 'staging.getaccountable.com';
    }
    // Local development
    return `${window.location.hostname}:${window.location.port}`;
  };

  const resolvedOrigin =
    origin ||
    (import.meta.env.PROD ||
    window.location.hostname.includes('getaccountable.com')
      ? `https://${subdomain}.${getBaseDomain()}`
      : `${window.location.protocol}//${getBaseDomain()}`);

  return `${resolvedOrigin}${normalizedPath}`;
}
