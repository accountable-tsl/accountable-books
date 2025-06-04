import jwt from "jsonwebtoken";
import csurf from "csurf";
import { ENV, isDev, isProd } from "../../config/env";
import { AppError, errorResponse } from "../../shared/utils/response.utils";
import {
  AuthCompanyContext,
  AuthUserContext,
  DecodedToken,
  TokenConfig,
  TokenExpiration,
} from "./auth.types";
import { Request, Response } from "express";
import { generateRandomToken } from "../../shared/utils/crypto.utils";
import { getSingleCompany } from "../../domains/companies/companies.model";
import { getCompanyRolesForUser } from "../../domains/userCompanyRole/userCompanyRole.model";

if (!ENV.JWT_ACCESS_SECRET || !ENV.JWT_REFRESH_SECRET) {
  throw new AppError("JWT secrets must be defined in .env");
}

export const JWT_CONFIG = {
  accessToken: {
    secret: ENV.JWT_ACCESS_SECRET,
    expiresIn: TokenExpiration.Access,
  } as TokenConfig,

  refreshToken: {
    secret: ENV.JWT_REFRESH_SECRET,
    expiresIn: TokenExpiration.Refresh,
  } as TokenConfig,
};

export const generateAuthTokens = (payload: DecodedToken) => {
  try {
    if (
      !payload.sub ||
      !JWT_CONFIG.accessToken.secret ||
      !JWT_CONFIG.refreshToken.secret
    ) {
      throw new Error("Invalid payload or missing JWT secrets");
    }

    const accessToken = jwt.sign(payload, JWT_CONFIG.accessToken.secret, {
      expiresIn: TokenExpiration.Access,
    });

    const refreshToken = jwt.sign(payload, JWT_CONFIG.refreshToken.secret, {
      expiresIn: TokenExpiration.Refresh,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw error;
  }
};

const cookieDomain = ENV.COOKIE_DOMAIN;

export const setAuthCookies = (
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string
) => {
  res.cookie("accessToken", accessToken, {
    domain: cookieDomain,
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
  });

  res.cookie("refreshToken", refreshToken, {
    domain: cookieDomain,
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  return req.csrfToken();
};

export const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isDev ? "lax" : "strict",
    domain: cookieDomain,
    path: "/",
  },
});

export async function buildAuthContext(decoded: DecodedToken) {
  const { sub, email, firstname, lastname, status, currentCompanyId } = decoded;
  if (!sub || !currentCompanyId) {
    return { success: false, error: errorResponse("Invalid token payload") };
  }

  const [roles, companyResult] = await Promise.all([
    getCompanyRolesForUser(sub),
    getSingleCompany(currentCompanyId),
  ]);

  if (!roles.success) {
    return { success: false, error: errorResponse(roles.message) };
  }

  if (!companyResult.success || !companyResult.data) {
    return {
      success: false,
      error: errorResponse(companyResult.message || "Company not found"),
    };
  }

  const companyData = Array.isArray(companyResult.data)
    ? companyResult.data[0]
    : companyResult.data;

  if (!companyData?.assignedFirmSlug) {
    return {
      success: false,
      error: errorResponse("Company not found"),
    };
  }

  const user: AuthUserContext = {
    id: sub,
    email,
    firstname,
    lastname,
    status,
    currentCompanyId,
    companyRoles: roles.data,
    assignedFirmSlug: companyData.assignedFirmSlug,
  };

  const company: AuthCompanyContext = {
    id: companyData.id,
    type: companyData.companyType,
    assignedFirmSlug: companyData.assignedFirmSlug,
    name: companyData.legalName,
    onboardingStatus: companyData.onboardingStatus,
  };

  return { success: true, user, company };
}
