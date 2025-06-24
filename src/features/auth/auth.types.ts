import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
import { UserCompanyRole } from "../../domains/usersCompaniesRoles/usersCompaniesRoles.types";
import {
  CompanyType,
  OnboardingStatus,
} from "../../domains/companies/companies.types";

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
  status: string;
  currentCompanyId?: string;
  [key: string]: any;
}

export interface AuthUserContext {
  id: string;
  email: string;
  firstname: string;
  lastname?: string;
  status: string;
  companies: AuthCompanyContext[];
  currentCompanyId: string;
  permissions?: any;
  // assignedFirmSlug?: string;
}

export interface AuthCompanyContext {
  id: string;
  assignedFirmSlug: string;
  name: string;
  type: CompanyType;
  role: string;
  onboardingStatus: OnboardingStatus;
}

export interface AuthRequest extends Request {
  user?: AuthUserContext;
  company?: AuthCompanyContext;
}

export type VerifyEmailParams =
  | { token: string; email: string }
  | { token: string; userId: string };

export interface ResendEmailParams {
  email: string;
  slug?: string;
  userId?: string;
}
