import { makeRoute } from "../shared/routes/routes-old";

// URL Structure: <firm-subdomain>.getaccountable.com/<companyId>/...

export const routes = {
  home: makeRoute({ staticPath: "/" }),

  auth: {
    root: makeRoute({ staticPath: "/auth" }),
    login: makeRoute({ staticPath: "/login" }),
    logout: makeRoute({ staticPath: "/logout" }),
    signup: makeRoute({ staticPath: "/signup" }),
    forgotPassword: makeRoute({ staticPath: "/forgot-password" }),
  },

  onboarding: {
    root: makeRoute({ staticPath: "/onboarding" }),
    welcome: makeRoute({ staticPath: "/welcome" }),
  },

  messages: {
    root: makeRoute({ staticPath: "/:id/messages" }),
  },
  dashboard: { root: makeRoute({ staticPath: "/:companyId/dashboard" }) },

  accounting: {
    root: makeRoute({ staticPath: "/:companyId/accounting" }),
  },

  tax: {
    root: makeRoute({ staticPath: "/:companyId/tax" }),
  },

  reports: {
    root: makeRoute({ staticPath: "/:companyId/reports" }),
    coa: makeRoute({ staticPath: "/:companyId/reports/coa" }),
  },

  workspace: {
    accounting: {
      root: makeRoute({ staticPath: "/:companyId/workspace/acc" }),
      uploadBank: makeRoute({
        staticPath: "/:companyId/workspace/acc/upload-bank",
      }),
      catEngine: makeRoute({
        staticPath: "/:companyId/workspace/acc/cat-engine",
      }),
      journal: makeRoute({ staticPath: "/:companyId/workspace/acc/journal" }),
      journalPages: makeRoute({
        staticPath: "/:companyId/workspace/acc/journal/*",
      }),
      newJournal: makeRoute({
        staticPath: "/:companyId/workspace/acc/journal/new",
      }),
      viewJournal: makeRoute({
        staticPath: "/:companyId/workspace/acc/journal/view/:journalId",
      }),
      editJournal: makeRoute({
        staticPath: "/:companyId/workspace/acc/journal/edit/:journalId",
      }),
      newRecurringJournal: makeRoute({
        staticPath: "/:companyId/workspace/acc/journal/recurring/new",
      }),
      editRecurringJournal: makeRoute({
        staticPath:
          "/:companyId/workspace/acc/journal/recurring/edit/:journalId",
      }),
      trialBalance: makeRoute({
        staticPath: "/:companyId/workspace/acc/trial-balance",
      }),
    },

    tax: {
      root: makeRoute({ staticPath: "/:companyId/workspace/tax" }),
      filings: makeRoute({
        staticPath: "/:companyId/workspace/tax/filings",
      }),
    },

    setup: {
      root: makeRoute({ staticPath: "/:companyId/workspace/acc/setup" }),
      coa: makeRoute({ staticPath: "/:companyId/workspace/acc/setup/coa" }),
      contacts: makeRoute({
        staticPath: "/:companyId/workspace/acc/setup/contacts",
      }),
      projects: makeRoute({
        staticPath: "/:companyId/workspace/acc/setup/projects",
      }),
      finSettings: makeRoute({
        staticPath: "/:companyId/workspace/acc/setup/fin-settings",
      }),
    },
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

  messages: {
    root: "/:id/messages",
  },
};
