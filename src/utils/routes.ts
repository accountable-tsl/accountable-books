const routes = {
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

export default routes;
