import type { AuthUserContext } from '@accountable-books/contracts/schema';
import { type Request } from 'express';
import { type JwtPayload } from 'jsonwebtoken';

import { type AccessibleCompanies } from '../../domains/user-roles/user-roles.types.js';
import { type UserOnboardingState } from '../../features/onboarding/onboarding.types.js';

import type { AuditContextInput } from '../../domains/audit/audit.types.js';

export type {
  AuthUserContext,
  CurrentCompanyContext as AuthCompanyContextWithOnboarding,
} from '@accountable-books/contracts/schema';
export type AuthCompanyContext = AccessibleCompanies;

export interface TokenConfig {
  secret: string;
  expiresIn: string;
}

export enum TokenExpiration {
  Access = '15m',
  Refresh = '7d',
  Verification = '14m',
}

export interface TokenPayload extends JwtPayload {
  sub: string;
}

export interface DecodedToken {
  sub: string;
  email: string;
  firstname: string;
  lastname?: string;
  emailVerifiedAt: Date | null;
  onboardingState: UserOnboardingState;
  currentCompanyId?: string; // This should be the short code of the company
}

export type CompanyRequestContext = {
  identifier: string;
  uuid: string;
  shortCode: string;
};

export interface BaseAuthRequest extends Request {
  user?: Partial<AuthUserContext> & { id: string };
  auditContext?: AuditContextInput;
}

export interface AuthRequest extends Request {
  user?: AuthUserContext;
  company?: AuthCompanyContext;
  companyContext?: CompanyRequestContext;
  auditContext?: AuditContextInput;
}

export type VerifyEmailInput = {
  token?: string;
  userId: string;
};

export type ResendVerificationEmailInput = VerifyEmailInput;
