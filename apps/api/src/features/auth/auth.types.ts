import { type Request } from 'express';
import { type JwtPayload } from 'jsonwebtoken';
import { type AccessibleCompanies } from '../../domains/userRoles/userRoles.types.js';
import { type RoleKey } from '../../domains/roles/roles.types.js';
import { type UserOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { type SchemaTypes } from '@accountable-books/api-types';

export interface TokenConfig {
  secret: string;
  expiresIn: string;
}

export enum TokenExpiration {
  Access = '15m',
  Refresh = '7d',
  Verification = '15m',
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
  currentCompanyId?: string;
}

export type OldAuthUserContext = {
  id: string;
  email: string;
  firstname: string;
  lastname?: string;

  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;

  currentCompanyId: string;
  currentCompany: AuthCompanyContext;
  companies: AuthCompanyContext[];
};
export type AuthUserContext = SchemaTypes.AuthUserContext;

export type OldAuthCompanyContext = AccessibleCompanies;
export type AuthCompanyContext = SchemaTypes.AuthCompanyContext;

export interface BaseAuthRequest extends Request {
  user?: Partial<AuthUserContext> & { id: string };
}

export interface AuthRequest extends Request {
  user?: AuthUserContext;
  company?: AuthCompanyContext;
}

export type VerifyEmailInput = {
  token?: string;
  userId: string;
};

export type ResendVerificationEmailInput = VerifyEmailInput;
