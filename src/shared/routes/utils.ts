import { AuthUserContext } from "@/features/auth/types";
import {
  BuildCanonicalUrlOptions,
  RouteKey,
  RouteLike,
} from "@/shared/routes/types";
import { routes } from "@/shared/routes/routes";

function flattenRoutes(obj: Record<string, unknown>): RouteLike[] {
  const flat: RouteLike[] = [];

  for (const value of Object.values(obj)) {
    if (
      value &&
      typeof value === "object" &&
      "staticPath" in value &&
      "meta" in value
    ) {
      flat.push(value as RouteLike);
    } else if (value && typeof value === "object") {
      flat.push(...flattenRoutes(value as Record<string, unknown>));
    }
  }

  return flat;
}

export function isPublicRoute(path: string): boolean {
  const flattened = flattenRoutes(routes);

  return flattened.some(
    (route) => route.meta?.public && path.startsWith(route.staticPath)
  );
}

export function memoize<Args extends any[], Return>(
  fn: (...args: Args) => Return,
  getKey?: (...args: Args) => string
): (...args: Args) => Return {
  const cache = new Map<string, Return>();

  return (...args: Args): Return => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Builds the canonical URL for a given user and route.
 *
 * This URL includes:
 * - The correct subdomain based on the user's assigned firm slug (in production)
 * - The current company ID injected into the path
 * - The route defined by the provided `routeKey`, plus optional `routeArgs`
 *
 * Example (production):
 *   https://firmSlug.getaccountable.com/companyId/dashboard
 *
 * Example (development):
 *   http://localhost:5173/companyId/dashboard
 *
 * Notes:
 * - The `routeKey` must exist in your central `routes` config.
 * - The route function must accept `companyId` as its first argument.
 * - `routeArgs` (if any) follow after `companyId`.
 * - If `fullPath` is an empty string, no trailing slash is added.
 *
 * @param user - The authenticated user (must contain `currentCompanyId` and a matching entry in `user.companies`)
 * @param routeKey - A key from the central `routes` object (e.g. 'home', 'dashboard')
 * @param routeArgs - Optional extra arguments passed to the route's `.path()` function after the company ID
 * @param origin - Optional override for base origin (defaults to subdomain logic in prod or current window origin in dev)
 * @returns The full canonical URL string
 * @throws If no matching company is found or the route key is invalid
 */
export function buildCanonicalUrl({
  user,
  routeKey,
  routeArgs = [],
  origin,
}: BuildCanonicalUrlOptions): string {
  const currentCompanyId = user.currentCompanyId;
  const company = user.companies.find((c) => c.id === currentCompanyId);

  if (!company) throw new Error("Current company not found in user data");

  const firmSlug = company.assignedFirmSlug;
  const routeConfig = routes[routeKey];
  if (!routeConfig)
    throw new Error(`Route key "${routeKey}" not found in routes`);

  const pathFn = routeConfig.path;

  const fullPath = (() => {
    if (typeof pathFn !== "function") {
      throw new Error(`Invalid path function for routeKey "${routeKey}"`);
    }

    switch (pathFn.length) {
      case 0:
        return pathFn();
      case 1:
        return pathFn(currentCompanyId);
      default:
        return pathFn(currentCompanyId, ...routeArgs);
    }
  })();
  const normalizedPath =
    fullPath === "" ? "" : fullPath.startsWith("/") ? fullPath : `/${fullPath}`;

  const baseOrigin =
    origin ||
    (import.meta.env.PROD
      ? `https://${firmSlug}.getaccountable.com`
      : `${window.location.protocol}//${window.location.hostname}:${window.location.port}`);

  return `${baseOrigin}${normalizedPath}`;
}

/**
 * Enforces that the current browser URL matches the canonical URL
 * for the authenticated user's current company and page.
 *
 * If the host or pathname does not match, performs a full page redirect
 * to the canonical URL. This ensures consistency across firm subdomains.
 *
 * @param user - The authenticated user context (source of companyId and firmSlug)
 * @param routeKey - The key of the route from your central `routes` object
 * @param routeArgs - Optional arguments passed to the route's path function (after companyId)
 */
export function enforceCanonicalUrl(
  user: AuthUserContext,
  routeKey: RouteKey,
  routeArgs: string[] = []
) {
  const currentHost = window.location.hostname;
  const currentPath = window.location.pathname;

  // Build the canonical URL for the user and route
  const canonicalUrl = buildCanonicalUrl({
    user,
    routeKey,
    routeArgs,
  });

  const canonical = new URL(canonicalUrl);

  const subdomainMismatch = currentHost !== canonical.hostname;
  const pathMismatch = currentPath !== canonical.pathname;

  if (subdomainMismatch || pathMismatch) {
    window.location.replace(canonical.href);
  }

  // If everything matches, do nothing (good URL, no redirect needed)
}
