import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
import { UserInfo } from "../../domains/user/user.types";
import { UserCompanyRoleResponse } from "../../domains/userCompanyRole/userCompanyRole.types";

export interface TokenConfig {
  secret: string;
  expiresIn: string;
}

export enum TokenExpiration {
  Access = "15m",
  Refresh = "7d",
  Verification = "5m",
}

export interface TokenPayload extends JwtPayload {
  sub: string;
}

export interface DecodedToken {
  sub: string;
}

export interface AuthRequest extends Request {
  user?: { id: string; roles?: Array<UserCompanyRoleResponse> };
}
