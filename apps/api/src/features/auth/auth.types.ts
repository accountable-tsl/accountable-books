import { type Request } from "express";
import { type JwtPayload } from "jsonwebtoken";
import { type AccessibleCompanies } from "../../domains/userRoles/userRoles.types.js";
import { type RoleKey } from "../../domains/roles/roles.types.js";
import {
  type OnboardingStateResult,
  type UserOnboardingState,
} from "../../features/onboarding/onboarding.types.js";

export interface TokenConfig {
  secret: string;
  expiresIn: string;
}

export enum TokenExpiration {
  Access = "15m",
  Refresh = "7d",
  Verification = "15m",
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

export type BaseUserAuthContext = {
  id: string;
  email?: string;
  firstname?: string;
  lastname?: string;

  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;

  currentCompanyId?: string;
  currentCompany?: AuthCompanyContextWithOnboarding;
  companies?: AuthCompanyContext[];
};

export type AuthUserContext = {
  id: string;
  email: string;
  firstname: string;
  lastname?: string;

  isPlatformUser?: boolean;
  platformUserKey?: RoleKey;

  currentCompanyId: string;
  currentCompany: AuthCompanyContextWithOnboarding;
  companies: AuthCompanyContext[];
};

export type AuthCompanyContext = AccessibleCompanies;
export type AuthCompanyContextWithOnboarding = AuthCompanyContext & {
  onboarding: OnboardingStateResult;
};

export interface BaseAuthRequest extends Request {
  user?: BaseUserAuthContext;
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
