import { CompanyType, OnboardingStatus } from "@/domains/company/types";
import { zEmail } from "@/shared/types/core";
import { z } from "zod";

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
  status: string;
  companies: AuthCompanyContext[];
  currentCompanyId: string;
  // permissions?: any;
}

export interface AuthCompanyContext {
  id: string;
  assignedFirmSlug: string;
  name: string;
  type: CompanyType;
  role: string;
  onboardingStatus: OnboardingStatus;
}
