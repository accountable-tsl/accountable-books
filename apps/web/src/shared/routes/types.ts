import type { flatRoutes } from './registry';
import type { routes } from './routes';
import type { createTenantRoutes } from './utils';

export type RouteMeta = {
  label?: string;
  description?: string;
  pageIcon?: string;
  role?: string[];
  sidebarCollapsed?: boolean;
  firmsOnly?: boolean;
  public?: boolean;
  hideInBreadcrumb?: boolean;
  requiresCompanyId?: boolean;
};

export type ExtractPathParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [k in Param]: string } & ExtractPathParams<`/${Rest}`>
    : Path extends `${string}:${infer Param}`
      ? { [k in Param]: string }
      : {};

export type HasCompanyId<Path extends string> =
  Path extends `${string}:companyId${string}` ? true : false; // Identify if a route expects companyId

export type OmitCompanyId<T> = T extends { companyId: any }
  ? Omit<T, 'companyId'>
  : T; // Extract route params except companyId

export type RouteLike = {
  staticPath: string;
  build: () => string;
  meta?: RouteMeta;
};

export interface BuildCanonicalUrlOptions<K extends FlattenedRouteKey> {
  user: {
    currentCompanyId: string;
    companies: Array<{ id: string; assignedFirmSlug: string }>;
  };
  routeKey: K;
  routeParams: OmitCompanyId<ExtractPathParams<FlatRoutes[K]['staticPath']>>;
  // what the route needs, excluding companyId
  origin?: string; // optional override
}

export type TenantRoutes = ReturnType<typeof createTenantRoutes<typeof routes>>;

export type FlatRoutes = typeof flatRoutes;
export type FlattenedRouteKey = keyof FlatRoutes;
export type RouteEntry = FlatRoutes[keyof FlatRoutes];
export type RouteKey = keyof FlatRoutes;

export interface RouteMatch {
  key: RouteKey;
  route: RouteEntry;
}

export interface RouteIndex {
  directRoutes: Map<string, RouteMatch>;
  companyRoutes: Map<string, RouteMatch>;
}
