import { z } from "zod";
import { zEmail } from "@/shared/types/core";
import { OnboardingState } from "@/features/onboarding/types";
import { CompanyType } from "@/domains/company/types";

export const loginForm = z.object({
  email: zEmail,
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginForm = z.infer<typeof loginForm>;

export interface AuthState {
  user: AuthUserContext | null;
  csrfToken: string | null;

  setUser: (user: AuthUserContext) => void;
  setCsrf: (csrfToken: string) => void;

  setAuth: (user: AuthUserContext, csrfToken: string) => void;
  clearAuth: () => void;
}

export interface SessionStore {
  checkingSession: boolean;
  sessionValid: boolean | null;
  failedAttempts: number;
  setCheckingSession: (value: boolean) => void;
  setSessionValid: (value: boolean | null) => void;
  incrementFailedAttempts: () => void;
  resetFailedAttempts: () => void;
}

export type LogoutOptions = {
  redirectTo?: string | false; // absolute or relative path
  query?: Record<string, string>; // e.g., { email: "foo@example.com" }
};

export interface AuthUserContext {
  id: string;
  email: string;
  firstname: string;
  lastname?: string;

  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;

  currentCompanyId: string;
  currentCompany: CurrentCompanyContext;
  companies: AuthCompanyContext[];
}

export interface AuthCompanyContext {
  id: string;
  assignedFirmSlug: string;
  hasExplicitAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  isDemoCompany: boolean;
  companyType: CompanyType;
}

export type CurrentCompanyContext = AuthCompanyContext & {
  onboarding: OnboardingState;
};

export const roleKey = z.enum([
  "super_admin",
  "support_admin",
  "support_agent",
  "firm_owner",
  "firm_admin",
  "accountant",
  "staff_accountant",
  "client_owner",
  "client_admin",
  "client_user",
]);
export type RoleKey = z.infer<typeof roleKey>;

export const roleScope = z.enum(["platform", "firm", "company"]);
export type RoleScope = z.infer<typeof roleScope>;
