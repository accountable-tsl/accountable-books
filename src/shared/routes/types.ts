import { routes } from "@/shared/routes/routes";
import { createTenantRoutes, flatRoutes } from "@/shared/routes/utils";

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
  ? Omit<T, "companyId">
  : T; // Extract route params except companyId

export type RouteLike = {
  staticPath: string;
  build: () => string;
  meta?: RouteMeta;
};

export type FlatRoutes = typeof flatRoutes;
export type FlattenedRouteKey = keyof FlatRoutes;

export interface BuildCanonicalUrlOptions<K extends FlattenedRouteKey> {
  user: {
    currentCompanyId: string;
    companies: Array<{ id: string; assignedFirmSlug: string }>;
  };
  routeKey: K;
  routeParams: OmitCompanyId<ExtractPathParams<FlatRoutes[K]["staticPath"]>>;
  // what the route needs, excluding companyId
  origin?: string; // optional override
}

export type TenantRoutes = ReturnType<typeof createTenantRoutes<typeof routes>>;
