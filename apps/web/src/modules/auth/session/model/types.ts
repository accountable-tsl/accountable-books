import { z } from 'zod';
import type {
  CompanyData,
  CompanyOnboardingState,
  CompanyType,
  OnboardingState,
} from '@/modules/company/companies';
import type { TenantRoutes } from '@/shared/routes/types';
import type { LogoutOptions } from '../../credentials';

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
  id: string; // API field name for companyId
  legalName: string;
  displayName: string | null;
  assignedFirmSlug: string; // API field name for firmSlug
  companyType: CompanyType;
  hasExplicitAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  isDemoCompany: boolean;
  onboardingState: CompanyOnboardingState;
}

export type CurrentCompanyContext = AuthCompanyContext & {
  onboarding: OnboardingState;
};

export const roleKey = z.enum([
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
export type RoleKey = z.infer<typeof roleKey>;

export const roleScope = z.enum(['platform', 'firm', 'company']);
export type RoleScope = z.infer<typeof roleScope>;

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
