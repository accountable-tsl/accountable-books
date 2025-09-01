import { z } from 'zod';
import { zEmail } from '@/shared/types/core';
import { type CompanyData, type CompanyType } from '@/domains/company/types';
import { type TenantRoutes } from '@/shared/routes/types';
import { type SchemaTypes, zodSchemas } from '@accountable-books/api-types';
import type { OnboardingState } from '@/features/onboarding/types';

export const loginForm = z.object({
  email: zEmail,
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

export interface OldAuthUserContext {
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

export type AuthUserContext = SchemaTypes.AuthUserContext & {
  currentCompany: CurrentCompanyContext;
};

export interface OldAuthCompanyContext {
  id: string;
  assignedFirmSlug: string;
  hasExplicitAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  isDemoCompany: boolean;
  companyType: CompanyType;
}
export type AuthCompanyContext = SchemaTypes.AuthCompanyContext;

export type CurrentCompanyContext = AuthCompanyContext & {
  onboarding: OnboardingState;
};

export const roleKey = zodSchemas.RoleKey;
export type RoleKey = SchemaTypes.RoleKey;
export const oldRoleKey = z.enum([
  'super_admin',
  'support_admin',
  'support_agent',
  'firm_owner',
  'firm_admin',
  'accountant',
  'staff_accountant',
  'client_owner',
  'client_admin',
  'client_user',
]);
export type OldRoleKey = z.infer<typeof oldRoleKey>;

export const roleScope = zodSchemas.RoleScope;
export type RoleScope = SchemaTypes.RoleScope;
export const oldRoleScope = z.enum(['platform', 'firm', 'company']);
export type OldRoleScope = z.infer<typeof oldRoleScope>;

export type SessionContextType = {
  loading: boolean;
  isLoggedIn: boolean;
  hasAppAccess: boolean;

  user: AuthUserContext | null;
  companyId?: string;
  onboarding?: OnboardingState;

  company?: CompanyData;
  companyType?: CompanyType;

  tenantRoutes: TenantRoutes | null;

  setAuth?: (user: AuthUserContext, csrfToken: string) => void;
  clearAuth?: () => void;
  refetchSession: (companyId?: string) => void;
  refetchCompany: () => void;
  logout: (options?: LogoutOptions) => Promise<boolean>;
};
