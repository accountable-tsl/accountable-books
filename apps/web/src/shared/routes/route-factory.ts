import type { ExtractPathParams, RouteMeta } from './types';

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
