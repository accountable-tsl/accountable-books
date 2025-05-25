import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
import { UserCompanyRole } from "../../domains/userCompanyRole/userCompanyRole.types";
import { CompanyType } from "../../domains/companies/companies.types";

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
  currentCompanyId: string;
  email: string;
  firstname: string;
  lastname?: string;
  status: string;
  [key: string]: any;
}

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
  assignedFirmSlug?: string;
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
