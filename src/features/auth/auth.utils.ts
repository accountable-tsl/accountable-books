import jwt from "jsonwebtoken";
import csurf from "csurf";
import { ENV, isDev, isProd } from "../../config/env";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  AuthCompanyContext,
  AuthUserContext,
  DecodedToken,
  TokenConfig,
  TokenExpiration,
} from "./auth.types";
import { Request, Response } from "express";
import { generateRandomToken } from "../../shared/utils/crypto.utils";
import {
  getCompaniesByIds,
  getSingleCompany,
} from "../../domains/companies/companies.model";
import { getCompanyRolesForUser } from "../../domains/usersCompaniesRoles/usersCompaniesRoles.model";
import { knexClient } from "../../../knexClient";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { ApiResponse } from "../../core/types/api.types";

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

export async function buildAuthContext(
  decoded: DecodedToken
): Promise<
  ApiResponse<{ user: AuthUserContext; activeCompany: AuthCompanyContext }>
> {
  try {
    const { sub, email, firstname, lastname, status, currentCompanyId } =
      decoded;
    if (!sub) return errorResponse("Invalid token payload, missing user ID");

    const rolesResult = await getCompanyRolesForUser(sub);
    if (!rolesResult.success || !rolesResult.data)
      return errorResponse(rolesResult.message);

    const roles = rolesResult.data;
    const accessibleCompanyIds = roles.map((r) => r.companyId);

    // Build companies array
    const companiesResult = await getCompaniesByIds(accessibleCompanyIds);
    if (!companiesResult.success || !companiesResult.data) {
      return errorResponse(
        companiesResult.message,
        companiesResult.data || companiesResult.error
      );
    }

    const companies: AuthCompanyContext[] = companiesResult.data
      .map((c) => {
        if (!c || !c.assignedFirmSlug) {
          return null;
        }

        return {
          id: c.id,
          type: c.companyType,
          assignedFirmSlug: c.assignedFirmSlug,
          name: c.legalName,
          onboardingStatus: c.onboardingStatus,
          role: roles.find((r) => r.companyId === c.id)?.roleName || "",
        };
      })
      .filter((c): c is AuthCompanyContext => c !== null);

    // Determine valid current company
    let activeCompanyId = currentCompanyId;
    if (!activeCompanyId || !accessibleCompanyIds.includes(activeCompanyId)) {
      activeCompanyId = roles[0].companyId;

      const activeCompanyUUID = await getCompanyUUID(activeCompanyId);

      // Update last_active_company_id
      await knexClient("users")
        .where("id", sub)
        .update("last_active_company_id", activeCompanyUUID);
    }

    // Build user context
    const user: AuthUserContext = {
      id: sub,
      email,
      firstname,
      lastname,
      status,
      currentCompanyId: activeCompanyId,
      companies,
      // permissions: to be handled later (to be added to companies)
    };

    // Build company context (this is mostly for easy access on req.company)
    const company = companies.find((c) => c.id === activeCompanyId);
    if (!company) {
      return errorResponse("Active company not found");
    }
    const activeCompany: AuthCompanyContext = company;

    return successResponse("Auth context built successfully", {
      user,
      activeCompany,
    });
  } catch (error) {
    return errorResponse("Something went wrong", error);
  }
}
