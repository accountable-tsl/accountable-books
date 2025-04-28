type companyId = string | null;
const PROD_ROOT = "getaccountable.com";

function getTenantBaseUrl(slug: string): string {
  const { protocol, hostname, port, origin } = window.location;

  if (hostname.endsWith(PROD_ROOT)) {
    return `${protocol}//${slug}.${PROD_ROOT}`;
  }

  return origin;
}

export const routes = {
  home: "/",
  companies: { root: "/companies" },

  dashboard: {
    root: (id: companyId) => `/${id}/dashboard`,
  },

  accounting: {
    root: (id: companyId) => `/${id}/accounting`,
    workspace: {
      root: (id: companyId) => `/${id}/workspace`,
      uploadBank: (id: companyId) => `/${id}/workspace/upload-bank`,
      catEngine: (id: companyId) => `/${id}/workspace/cat-engine`,
      journal: (id: companyId) => `/${id}/workspace/journal`,
      newJournal: (id: companyId) => `/${id}/workspace/journal/new`,
      viewJournal: (id: companyId, journalId: string) =>
        `/${id}/workspace/journal/${journalId}`,
      editJournal: (id: companyId, journalId: string) =>
        `/${id}/workspace/journal/edit/${journalId}`,
      newRecurringJournal: (id: companyId) =>
        `/${id}/workspace/journal/recurring/new`,
      editRecurringJournal: (id: companyId, journalId: string) =>
        `/${id}/workspace/journal/recurring/edit/${journalId}`,
      trialBalance: (id: companyId) => `/${id}/workspace/trial-balance`,
    },

    setup: {
      root: (id: companyId) => `/${id}/workspace/setup`,
      coa: (id: companyId) => `/${id}/workspace/setup/coa`,
      contacts: (id: companyId) => `/${id}/workspace/setup/contacts`,
      projects: (id: companyId) => `/${id}/workspace/setup/projects`,
      finSettings: (id: companyId) => `/${id}/workspace/setup/fin-settings`,
    },
  },

  tax: {
    root: (id: companyId) => `/companies/${id}/tax`,
    workspace: {
      root: (id: companyId) => `/companies/${id}/workspace/tax`,
      filings: (id: companyId) => `/companies/${id}/tax/workspace/`,
    },
  },

  reports: {
    root: (id: companyId) => `/${id}/reports`,
    coa: (id: companyId) => `/${id}/reports/coa`,
  },

  auth: {
    root: "/auth",
    login: "/login",
    logout: "/logout",
    signup: "/signup",
    forgotPassword: "/forgot-password",
  },

  onboarding: {
    root: "/onboarding",
    welcome: "/welcome",
  },
};

export const staticRoutes = {
  home: "/",
  companies: { root: "/companies" },
  dashboard: { root: "/:id/dashboard" },

  accounting: {
    root: "/:id/accounting",
    workspace: {
      root: "/:id/workspace",
      uploadBank: "/:id/workspace/upload-bank",
      catEngine: "/:id/workspace/cat-engine",
      journal: "/:id/workspace/journal",
      journalPages: "/:id/workspace/journal/*",
      newJournal: "/:id/workspace/journal/new",
      viewJournal: "/:id/workspace/journal/:journalId",
      editJournal: "/:id/workspace/journal/edit/:journalId",
      newRecurringJournal: "/:id/workspace/journal/recurring/new",
      editRecurringJournal: "/:id/workspace/journal/recurring/edit/:journalId",
      trialBalance: "/:id/workspace/trial-balance",
    },

    setup: {
      root: "/:id/workspace/setup",
      coa: "/:id/workspace/setup/coa",
      contacts: "/:id/workspace/setup/contacts",
      projects: "/:id/workspace/setup/projects",
      finSettings: "/:id/workspace/setup/fin-settings",
    },
  },

  tax: {
    root: "/companies/:id/tax",
    workspace: {
      root: "/companies/:id/workspace/tax",
      filings: "/companies/:id/tax/workspace/",
    },
  },

  reports: {
    root: "/:id/reports",
    coa: "/:id/reports/coa",
  },

  auth: {
    root: "/auth",
    login: "/login",
    logout: "/logout",
    signup: "/signup",
    forgotPassword: "/forgot-password",
  },

  onboarding: {
    root: "/onboarding",
    welcome: "/welcome",
  },
};
