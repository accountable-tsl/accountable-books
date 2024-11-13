type companyId = companyId | null;

export const routes = {
  home: "/",
  companies: { root: "/companies" },

  accounting: {
    root: (id: companyId) => `/companies/${id}/accounting`,
    workpapers: {
      root: (id: companyId) => `/companies/${id}/acc/workpapers`,
      uploadBank: (id: companyId) =>
        `/companies/${id}/acc/workpapers/upload-bank`,
      catEngine: (id: companyId) =>
        `/companies/${id}/acc/workpapers/cat-engine`,
      trialBalance: (id: companyId) =>
        `/companies/${id}/acc/workpapers/trial-balance`,
    },

    setup: {
      root: (id: companyId) => `/companies/${id}/acc/setup`,
      coa: (id: companyId) => `/companies/${id}/acc/setup/coa`,
      contacts: (id: companyId) => `/companies/${id}/acc/setup/contacts`,
      projects: (id: companyId) => `/companies/${id}/acc/setup/projects`,
      finSettings: (id: companyId) => `/companies/${id}/acc/setup/fin-settings`,
    },
  },

  tax: {
    root: (id: companyId) => `/companies/${id}/tax`,
    workpapers: {
      root: (id: companyId) => `/companies/${id}/tax/workpapers`,
      filings: (id: companyId) => `/companies/${id}/tax/workpapers/`,
    },
  },

  reports: (id: companyId) => `/companies/${id}/reports`,
};

export const staticRoutes = {
  home: "/",
  companies: { root: "/companies" },

  accounting: {
    root: "/companies/:id/accounting",
    workpapers: {
      root: "/companies/:id/acc/workpapers",
      uploadBank: "/companies/:id/acc/workpapers/upload-bank",
      catEngine: "/companies/:id/acc/workpapers/cat-engine",
      trialBalance: "/companies/:id/acc/workpapers/trial-balance",
    },

    setup: {
      root: "/companies/:id/acc/setup",
      coa: "/companies/:id/acc/setup/coa",
      contacts: "/companies/:id/acc/setup/contacts",
      projects: "/companies/:id/acc/setup/projects",
      finSettings: "/companies/:id/acc/setup/fin-settings",
    },
  },

  tax: {
    root: "/companies/:id/tax",
    workpapers: {
      root: "/companies/:id/tax/workpapers",
      filings: "/companies/:id/tax/workpapers/",
    },
  },

  reports: "/companies/:id/reports",
};
