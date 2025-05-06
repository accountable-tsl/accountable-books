import { companyStore } from "@/domains/company/store";
import { MakeRouteParams, RouteMeta, Tenant, ValidParams } from "./types";

/**
 * =====================
 * ROUTE BUILDING RULES
 * =====================
 *
 * buildPath(params)
 * -------------------
 * - Use when navigating inside the app (React Router <Navigate> or <Link>).
 * - Returns a relative path (e.g., "/accX/dashboard").
 * - Example: <Navigate to={routes.dashboard.buildPath({ companyId })} />
 *
 * buildUrl(params)
 * -------------------
 * - Use when you need a full URL (including domain, slug, etc).
 * - For example when doing a hard redirect with window.location.href.
 * - Example: window.location.href = routes.dashboard.buildUrl({ companyId });
 *
 * Summary:
 * - <Navigate> → buildPath
 * - <Link> → buildPath
 * - window.location.href → buildUrl
 *
 * Important:
 * - NEVER pass buildUrl() result into <Navigate> or <Link>.
 *   It expects relative path, not full URL.
 * - buildUrl() automatically includes tenant slug + domain.
 */

export const routes = {
  home: makeRoute({ staticPath: "/" }),

  // AUTH
  login: makeRoute({ staticPath: "/login", meta: { public: true } }),
  logout: makeRoute({ staticPath: "/logout", meta: { public: true } }),
  signup: makeRoute({ staticPath: "/signup", meta: { public: true } }),
  forgotPassword: makeRoute({
    staticPath: "/forgot-password",
    meta: { public: true },
  }),

  // ONBOARDING
  onboarding: {
    index: makeRoute({ staticPath: "/onboarding" }),
    welcome: makeRoute({ staticPath: "/onboarding/welcome" }),
  },

  // DASHBOARD
  dashboard: makeRoute({ staticPath: "/:companyId/dashboard" }),

  //BANK STATEMENT
  bank: {
    upload: makeRoute({
      staticPath: "/:companyId/bank/upload",
    }),
    link: makeRoute({
      staticPath: "/:companyId/bank/link",
    }),
  },

  setup: {
    coa: makeRoute({
      staticPath: "/:companyId/setup/coa",
      meta: { firmsOnly: true },
    }), // Chart of Accounts
    contacts: makeRoute({
      staticPath: "/:companyId/setup/contacts",
    }),
    projects: makeRoute({
      staticPath: "/:companyId/setup/projects",
    }),
    finSettings: makeRoute({
      staticPath: "/:companyId/setup/financial-settings",
    }),
  },

  accounting: {
    index: makeRoute({ staticPath: "/:companyId/acc" }),

    workstation: {
      index: makeRoute({ staticPath: "/:companyId/acc/workstation" }),
      catEngine: makeRoute({
        staticPath: "/:companyId/acc/workstation/cat-engine",
        meta: {
          label: "Categorization Engine",
          sidebarCollapsed: true,
        },
      }),

      journals: makeRoute({
        staticPath: "/:companyId/acc/workstation/journal",
      }),

      newJournal: makeRoute({
        staticPath: "/:companyId/acc/workstation/journal/new",
      }),
      viewJournal: makeRoute({
        staticPath: "/:companyId/acc/workstation/journal/:journalId",
      }),
      editJournal: makeRoute({
        staticPath: "/:companyId/acc/workstation/journal/:journalId/edit",
      }),
      newRecurringJournal: makeRoute({
        staticPath: "/:companyId/acc/workstation/journal/recurring/new",
      }),
      editRecurringJournal: makeRoute({
        staticPath:
          "/:companyId/acc/workstation/journal/recurring/edit/:journalId",
      }),
      trialBalance: makeRoute({
        staticPath: "/:companyId/acc/workstation/trial-balance",
      }),
    },
  },

  tax: {
    index: makeRoute({ staticPath: "/:companyId/tax" }),
    workstation: {
      index: makeRoute({ staticPath: "/:companyId/tax/workstation" }),
      state: makeRoute({ staticPath: "/:companyId/tax/workstation/state" }),
      federal: makeRoute({ staticPath: "/:companyId/tax/workstation/federal" }),
    },
  },

  // MESSAGES
  messages: makeRoute({ staticPath: "/:companyId/messages" }),

  // REPORTS
  reports: {
    index: makeRoute({ staticPath: "/:companyId/reports" }),
  },
} as const;

export function makeRoute<T extends string>({
  staticPath,
  relativePath,
  dynamicPath,
  meta = {},
}: MakeRouteParams<T>) {
  const computedRelativePath =
    relativePath || staticPath.replace(/:[^/]+/g, "");
  const computedMeta: RouteMeta = {
    label: getDefaultPageLabel(staticPath),
    role: [],
    sidebarCollapsed: false,
    firmsOnly: staticPath.includes("/workspace/"),
    ...meta,
  };

  // Extract required params from staticPath
  const requiredParams = (staticPath.match(/:[^/]+/g) || [])
    .map((p) => p.slice(1))
    .filter((p) => p !== "companyId");

  return {
    staticPath,
    relativePath: computedRelativePath,
    meta: computedMeta,

    /** buildPath: Only builds relative path, no slug/companyId */
    buildPath: (params: Partial<ValidParams<T>> = {}) => {
      // If no params are required, allow empty params
      if (!requiredParams.length && !params.companyId) {
        return dynamicPath ? dynamicPath({} as ValidParams<T>) : staticPath;
      }
      // const requiredParams = (staticPath.match(/:[^/]+/g) || [])
      //   .map((p) => p.slice(1))
      //   .filter((p) => p !== "companyId");

      // Enforce companyId for routes with params
      if (!params.companyId) {
        return "/not-found";
      }

      for (const param of requiredParams) {
        if (!params[param as keyof ValidParams<T>]) {
          return "/not-found";
        }
      }

      let finalPath = dynamicPath
        ? dynamicPath(params as ValidParams<T>)
        : staticPath;
      for (const [key, value] of Object.entries(params)) {
        finalPath = finalPath.replace(`:${key}`, value || "");
      }
      if (finalPath.startsWith("/:companyId")) {
        finalPath = finalPath.replace("/:companyId", "");
      }
      return finalPath;
    },

    /** buildUrl: Full URL builder, safe to use inside components */
    buildUrl: (params: ValidParams<T>, tenant?: Tenant) => {
      const ctx = tenant ?? companyStore.getState();
      const { slug: firmSlug, companyId, companyType } = ctx;
      if (
        !companyId ||
        (computedMeta.firmsOnly && companyType !== "accounting_firm")
      ) {
        return "/access-denied";
      }

      // If no params are required, allow empty params
      if (!requiredParams.length && !params.companyId) {
        const finalPath = dynamicPath
          ? dynamicPath({} as ValidParams<T>)
          : staticPath;
        return buildTenantUrl({
          firmSlug: firmSlug || "app",
          companyId,
          path: finalPath.replace("/:companyId", ""),
        });
      }

      if (!params.companyId) {
        return "/not-found";
      }

      for (const param of requiredParams) {
        if (!params[param as keyof ValidParams<T>]) {
          return "/not-found";
        }
      }
      const finalPath = dynamicPath
        ? dynamicPath(params as ValidParams<T>)
        : staticPath;

      let builtPath = finalPath;

      for (const [key, value] of Object.entries(params)) {
        builtPath = builtPath.replace(`:${key}`, value || "");
      }

      if (builtPath.startsWith(`/${params.companyId}`)) {
        builtPath = builtPath.replace(`/${params.companyId}`, "");
      }
      return buildTenantUrl({
        firmSlug: firmSlug || "app",
        companyId,
        path: builtPath,
      });
    },
  };
}

export function getDefaultPageLabel(path: string): string {
  const segments = path.split("/").filter(Boolean);

  // Prefer last segment that is NOT a dynamic param (not starting with ":")
  const lastStaticSegment = [...segments]
    .reverse()
    .find((seg) => !seg.startsWith(":"));

  if (!lastStaticSegment) {
    return "Home";
  }

  return lastStaticSegment
    .replace(/-/g, " ") // Replace dashes with spaces
    .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize words
}

export function buildTenantUrl({
  firmSlug,
  companyId,
  path,
}: {
  firmSlug: string;
  companyId: string;
  path?: string;
}): string {
  const cleanPath = path?.startsWith("/") ? path : `/${path || ""}`;

  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || "getaccountable.com";
  const port = window.location.port || "5173";
  const url = import.meta.env.PROD
    ? `https://${firmSlug}.${baseDomain}/${companyId}${cleanPath}`
    : `http://${firmSlug}.${baseDomain}:${port}/${companyId}${cleanPath}`;

  return url;
}
