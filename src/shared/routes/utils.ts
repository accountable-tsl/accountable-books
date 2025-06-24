import { AuthUserContext } from "@/features/auth/types";
import { routes } from "./routes-old";
import { BuildCanonicalUrlOptions, RouteLike } from "./types";

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
 * Builds the canonical URL for the given user and optional subpath.
 *
 * The generated URL will include:
 *   - The correct firm subdomain (in production)
 *   - The user's current companyId in the path
 *   - The provided subpath (appended after /companyId)
 *
 * Example result:
 *   https://firmSlug.getaccountable.com/companyId/subpath
 *
 * @param user - The authenticated user context (source of truth for companyId + firmSlug)
 * @param subpath - The optional subpath (e.g. '/dashboard', '/invoices'). Do not include companyId here.
 * @param origin - Optional override for origin (for testing / special cases)
 *
 * @returns The full canonical URL as a string
 */

export function buildCanonicalUrl({
  user,
  subpath: path = "",
  origin,
}: BuildCanonicalUrlOptions): string {
  const currentCompanyId = user.currentCompanyId;
  const company = user.companies.find((c) => c.id === currentCompanyId);

  if (!company) {
    throw new Error("Current company not found in user data");
  }

  const firmSlug = company.assignedFirmSlug;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const baseOrigin =
    origin ||
    (import.meta.env.PROD
      ? `https://${firmSlug}.getaccountable.com`
      : `${window.location.protocol}//${window.location.hostname}:${window.location.port}`);

  return `${baseOrigin}/${currentCompanyId}${cleanPath}`;
}

/**
 * Enforces that the user is on the correct canonical URL.
 * Redirects to the canonical URL if the current URL does not match.
 *
 * @param user Authenticated user context (source of truth)
 */

export function enforceCanonicalUrl(user: AuthUserContext) {
  const currentHost = window.location.hostname;
  const currentPath = window.location.pathname;

  // Remove the companyId from currentPath for path comparison (if present)
  const strippedPath = currentPath
    .replace(`/${user.currentCompanyId}`, "")
    .replace(/\/+$/, "");

  // Build the canonical URL for this user and path
  const canonicalUrl = buildCanonicalUrl({
    user,
    path: strippedPath,
  });

  const canonical = new URL(canonicalUrl);

  // Check subdomain/host mismatch
  // const subdomainMismatch =
  //   import.meta.env.PROD && currentHost !== canonical.hostname;
  // removing import.meta.env.PROD for now to test on .lvh.me
  const subdomainMismatch = currentHost !== canonical.hostname;

  const pathMismatch = currentPath !== canonical.pathname;

  if (subdomainMismatch || pathMismatch) {
    window.location.replace(canonical.href);
  }

  // If everything matches, do nothing (good URL)
}
