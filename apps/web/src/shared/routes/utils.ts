import { AuthUserContext } from '@/features/auth/types';
import {
  BuildCanonicalUrlOptions,
  ExtractPathParams,
  FlatRoutes,
  FlattenedRouteKey,
  HasCompanyId,
  OmitCompanyId,
  RouteIndex,
  RouteLike,
  RouteMatch,
  RouteMeta,
} from '@/shared/routes/types';
import { routes } from '@/shared/routes/routes';
import { matchPath, Route } from 'react-router-dom';

/**
 * Replace route params in a template string with the actual values.
 * Throws if any param is missing.
 * @param template The template string, e.g. `/users/:userId`
 * @param params The object containing the values for the route params, e.g. `{ userId: '123' }`
 * @returns The path with the params replaced, e.g. `/users/123`
 */
function buildPath<Path extends string>(
  template: Path,
  params: ExtractPathParams<Path>,
  options: { requiresCompanyId: boolean },
): string {
  const { requiresCompanyId } = options ?? {};

  let effectiveTemplate: string = template;
  if (requiresCompanyId) {
    const normalized = template.startsWith('/') ? template : `/${template}`;
    effectiveTemplate = `/:companyId${normalized}`;
  }

  return effectiveTemplate.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
    const value = params[key as keyof typeof params];
    if (!value) throw new Error(`Missing value for route param: ${key}`);
    return encodeURIComponent(String(value));
  });
}

/**
 * Create a route object with a `staticPath` and a `build` method.
 *
 * The `build` method takes an object with route params and returns the
 * path with the params replaced.
 *
 * The `staticPath` is the path template, e.g. `/users/:userId`.
 *
 * The `meta` property is an optional object with metadata for the route,
 * e.g. a label for the route.
 *
 * @example
 * const userRoute = route('/users/:userId');
 * const path = userRoute.build({ userId: '123' }); // '/users/123'
 */
export function route<TPath extends string>(template: TPath, meta?: RouteMeta) {
  const cleanTemplate = template.startsWith('/') ? template : `/${template}`;
  const defaultMeta = {
    public: false,
    requiresCompanyId: true,
    sidebarCollapsed: false,
    ...meta, // overrides above defaults if defined
  };

  return {
    staticPath: cleanTemplate,
    relativePath: cleanTemplate.slice(1),
    build: (params: ExtractPathParams<TPath>) =>
      buildPath(cleanTemplate, params, {
        requiresCompanyId: defaultMeta.requiresCompanyId,
      }),

    meta: defaultMeta,
  };
}

/**
 * Given a routes object, create a new object with the same keys, but:
 * - For each leaf route (with `.build()` function), if the route expects
 *   a `:companyId` param in its path, the wrapped function expects all
 *   other params except `companyId`, and `companyId` is injected automatically
 *   from context.
 * - For each nested route group, recurse the same logic.
 * - For static routes (no params expected), the function takes no arguments.
 * @param routes The input routes object
 * @param companyId The companyId to inject for routes that expect it
 * @returns A new object with the same keys as `routes`, but with
 *   the modified functions as described above.
 */
export function createTenantRoutes<T extends Record<string, any>>(routes: T, companyId: string) {
  // We create a new object with the same keys as the input routes.
  // The mapped type below defines the return type recursively,
  // distinguishing between leaf routes (with `.build()` functions)
  // and nested route namespaces.
  const tenantRoutes = {} as {
    [K in keyof T]: T[K] extends {
      staticPath: infer P extends string;
      build: (params: any) => string;
    }
      ? HasCompanyId<P> extends true
        ? // If the route expects `:companyId` param in its path,
          // the wrapped function expects all other params except `companyId`,
          // and companyId is injected automatically from context.
          (params: OmitCompanyId<ExtractPathParams<P>>) => string
        : // Otherwise, no params expected (static route), function takes no arguments.
          () => string
      : // For nested route groups, recurse the same logic
        T[K] extends Record<string, any>
        ? ReturnType<typeof createTenantRoutes<T[K]>>
        : never;
  };

  // Iterate over each key in the routes object
  for (const key in routes) {
    const routeOrNamespace = routes[key];

    if ('staticPath' in routeOrNamespace && 'build' in routeOrNamespace) {
      // Leaf route detected: an object with `.staticPath` and `.build`

      if (routeOrNamespace?.meta.requiresCompanyId) {
        // Route expects companyId param, so we wrap `.build`
        tenantRoutes[key] = ((params: any) => {
          if (!companyId) throw new Error('companyId not found in context');
          // Inject companyId automatically, merge with other params,
          // and call original build function
          return routeOrNamespace.build({ companyId, ...params });
        }) as any; // Type assertion to satisfy TS (already covered by mapped type)
      } else {
        // Static route: no params expected
        tenantRoutes[key] = (() => routeOrNamespace.build({})) as any;
      }
    } else {
      // Nested route group: recurse to create nested tenantRoutes object
      tenantRoutes[key] = createTenantRoutes(routeOrNamespace, companyId) as any;
    }
  }

  return tenantRoutes;
}

export function flattenRoutes(obj: Record<string, unknown>): RouteLike[] {
  const flat: RouteLike[] = [];

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && 'staticPath' in value && 'meta' in value) {
      flat.push(value as RouteLike);
    } else if (value && typeof value === 'object') {
      flat.push(...flattenRoutes(value as Record<string, unknown>));
    }
  }

  return flat;
}

export function memoize<Args extends any[], Return>(
  fn: (...args: Args) => Return,
  getKey?: (...args: Args) => string,
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

// The core route type created by `route()`
export type RouteEntry = ReturnType<typeof route>;

export type RouteKey = keyof typeof routes;

export function flatRoutesForCanonicalUrls(
  obj: Record<string, any>,
  prefix = '',
): Record<string, RouteEntry> {
  const flat: Record<string, RouteEntry> = {};

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && 'build' in value && 'staticPath' in value) {
      flat[path] = value as RouteEntry;
    } else if (value && typeof value === 'object') {
      Object.assign(flat, flatRoutesForCanonicalUrls(value, path));
    }
  }

  return flat;
}

export const flatRoutes = flatRoutesForCanonicalUrls(routes);

export const routeIndex = buildSmartIndex(flatRoutes);

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
    throw new Error(`Route key "${routeKey}" not found. Available keys: ${availableKeys}`);
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

  const resolvedOrigin =
    origin ||
    (import.meta.env.PROD
      ? `https://${firmSlug}.getaccountable.com`
      : `${window.location.protocol}//${window.location.hostname}:${window.location.port}`);

  return `${resolvedOrigin}${normalizedPath}`;
}

export const flattenedRoutes = flattenRoutes(routes);

export function matchRouteForPath(path: string): RouteLike | undefined {
  return flattenedRoutes.find((route) => matchPath({ path: route.staticPath, end: true }, path));
}

const flattenedPublicRoutes = flattenRoutes(routes).filter((r) => r.meta?.public);

export function isPublicRoute(path: string): boolean {
  return flattenedPublicRoutes.some((route) =>
    matchPath({ path: route.staticPath, end: true }, path),
  );
}

function buildSmartIndex(flatRoutes: FlatRoutes): RouteIndex {
  const directRoutes = new Map(); // For routes without company ID
  const companyRoutes = new Map(); // For routes with company ID (indexed by suffix)

  Object.entries(flatRoutes).forEach(([key, route]) => {
    const { staticPath, meta } = route;

    if (meta?.requiresCompanyId) {
      companyRoutes.set(staticPath, { key, route });
    } else {
      directRoutes.set(staticPath, { key, route });
    }
  });

  return { directRoutes, companyRoutes };
}

export function findMatchingRouteSmart(index: RouteIndex, pathname: string): RouteMatch | null {
  const { directRoutes, companyRoutes } = index;

  // Try direct match first
  const directMatch = directRoutes.get(pathname);
  if (directMatch) {
    return directMatch;
  }

  // Try company route match
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1) {
    const suffixPath = '/' + segments.slice(1).join('/');
    const companyMatch = companyRoutes.get(suffixPath);
    if (companyMatch) {
      return companyMatch;
    }
  }

  return null;
}
