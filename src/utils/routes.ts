type companyId = string | null;

export const routes = {
  home: "/",
  companies: { root: "/companies" },

  accounting: {
    root: (id: companyId) => `/${id}/accounting`,
    workspace: {
      root: (id: companyId) => `/${id}/workspace`,
      uploadBank: (id: companyId) => `/${id}/workspace/upload-bank`,
      catEngine: (id: companyId) => `/${id}/workspace/cat-engine`,
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
      root: (id: companyId) => `/companies/${id}/tax/workspace`,
      filings: (id: companyId) => `/companies/${id}/tax/workspace/`,
    },
  },

  reports: (id: companyId) => `/companies/${id}/reports`,
};

export const staticRoutes = {
  home: "/",
  companies: { root: "/companies" },

  accounting: {
    root: "/:id/accounting",
    workspace: {
      root: "/:id/workspace",
      uploadBank: "/:id/workspace/upload-bank",
      catEngine: "/:id/workspace/cat-engine",
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
      root: "/companies/:id/tax/workspace",
      filings: "/companies/:id/tax/workspace/",
    },
  },

  reports: "/companies/:id/reports",
};
