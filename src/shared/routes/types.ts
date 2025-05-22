import { CompanyType } from "@/domains/company/types";
import { makeRoute } from "./routes";

// Extract parameters from staticPath (e.g., ":companyId" -> "companyId")
export type ExtractParams<T extends string> =
  T extends `${string}:${infer P}/${infer R}`
    ? P | ExtractParams<R>
    : T extends `${string}:${infer P}`
    ? P
    : never;

// Metadata for UX and access control
export type RouteMeta = {
  label?: string;
  description?: string;
  pageIcon?: string;
  role?: string[];
  sidebarCollapsed?: boolean;
  firmsOnly?: boolean;
  public?: boolean;
};

export interface Tenant {
  slug: string;
  companyId: string;
  companyType: CompanyType;
}

// Restrict params to only those in staticPath, ensuring companyId is required
export type ValidParams<T extends string> = {
  [K in ExtractParams<T>]: K extends "companyId" ? string : string | undefined;
} & { companyId: string };

export type ParamConstraintMap = Record<string, string>;

// Route definition
export interface MakeRouteParams<T extends string> {
  staticPath: T;
  relativePath?: string;
  dynamicPath?: (params: ValidParams<T>) => string;
  meta?: RouteMeta;
}

export type RouteLike = ReturnType<typeof makeRoute>;
