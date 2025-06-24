import { RouteConfig } from "@/shared/routes/types";

export const routes: Record<string, RouteConfig> = {
  home: {
    path: (companyId: string) => `/${companyId}`,
    staticPath: "/:companyId/home",
    meta: { label: "Home", sidebarCollapsed: true },
  },

  homeAlias: {
    path: (companyId: string) => `/${companyId}/dashboard`,
    staticPath: "/:companyId",
    meta: { label: "Home", sidebarCollapsed: true },
  },

  // AUTH
  login: {
    path: () => "/login",
    staticPath: "/login",
    meta: { public: true, label: "Login" },
  },
  logout: {
    path: () => "/logout",
    staticPath: "/logout",
    meta: { public: true, label: "Logout" },
  },
  signup: {
    path: () => "/signup",
    staticPath: "/signup",
    meta: { public: true, label: "Sign Up" },
  },
  forgotPassword: {
    path: () => "/forgot-password",
    staticPath: "/forgot-password",
    meta: { public: true, label: "Forgot Password" },
  },

  // ONBOARDING
  onboarding: {
    path: () => "/onboarding",
    staticPath: "/onboarding",
    meta: { label: "Onboarding" },
  },

  welcome: {
    path: (companyId: string) => `/${companyId}/welcome`,
    staticPath: "/:companyId/welcome",
    meta: { label: "Welcome" },
  },

  verifyEmail: {
    path: () => "/verify-email",
    staticPath: "/verify-email",
    meta: { public: true, label: "Verify Email" },
  },

  catEngine: {
    path: (companyId: string) => `/${companyId}/acc/cat-engine`,
    staticPath: "/:companyId/acc/cat-engine",
    meta: {
      label: "Categorization Engine",
      sidebarCollapsed: true,
      firmsOnly: true, // for users with role admin or bookkeeper and of course super admin... basicially all user roles except for client and demo_user
    },
  },
} as const;
