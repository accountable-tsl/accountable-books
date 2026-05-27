import type { CompanyData } from '@/modules/company/companies/model/types';
import type { TenantRoutes } from '@/shared/routes/types';
import type {
  AuthUserContext,
  CompanyType,
  CurrentCompanyContext,
} from '@accountable-books/contracts/schema';
import { roleKey, roleScope } from '@accountable-books/contracts/schema';

import type { LogoutOptions } from '../../credentials';

export type {
  AuthCompanyContext,
  AuthUserContext,
  CurrentCompanyContext,
  RoleKey,
  RoleScope,
} from '@accountable-books/contracts/schema';
export { roleKey, roleScope };

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

export type SessionContextType = {
  loading: boolean;
  isLoggedIn: boolean;
  hasAppAccess: boolean;

  user: AuthUserContext | null;
  companyId?: string;
  onboarding?: CurrentCompanyContext['onboarding'];

  company?: CompanyData;
  companyType?: CompanyType;

  tenantRoutes: TenantRoutes | null;

  setAuth?: (user: AuthUserContext, csrfToken: string) => void;
  clearAuth?: () => void;
  refetchSession: (companyId?: string) => void;
  refetchCompany: () => void;
  logout: (options?: LogoutOptions) => Promise<boolean>;
};
