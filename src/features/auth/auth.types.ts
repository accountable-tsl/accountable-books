import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
import { UserCompanyRole } from "../../domains/userCompanyRole/userCompanyRole.types";

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
}

export interface LoginRole {
  company_id: string;
  role_id: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    currentCompanyId: string;
    companyRoles?: Array<{ company_id: string; role_id: string }>;
    permissions?: Array<{ permission: string }>;
  };
}
