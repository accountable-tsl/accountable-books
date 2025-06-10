import { CompanyType, OnboardingStatus } from "@/domains/company/types";
import { zEmail } from "@/shared/types/core";
import { z } from "zod";

export const loginForm = z.object({
  email: zEmail,
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginForm = z.infer<typeof loginForm>;

export interface AuthStore {
  user: any | null;
  setUser: (user: any | null) => void;
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
  companyRoles: {
    companyId: string;
    roleId: string;
  }[];
  currentCompanyId: string;
  assignedFirmSlug?: string;
  permissions?: any;
}

export interface AuthCompanyContext {
  id: string;
  type: CompanyType;
  name: string;
  onboardingStatus: OnboardingStatus;
  assignedFirmSlug?: string;
}
