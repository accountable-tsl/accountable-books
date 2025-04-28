import jwt from "jsonwebtoken";
import { generateAuthTokens, JWT_CONFIG } from "./auth.utils";
import { DecodedToken, LoginRole, TokenExpiration } from "./auth.types";
import knex from "../../../knexClient";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { comparePassword } from "../../shared/utils/crypto.utils";
import { ApiResponse } from "../../core/types/api.types";
import { redis } from "../../lib/redis";
import { getSingleCompany } from "../../domains/companies/companies.model";

export async function loginService(
  email: string,
  password: string
): Promise<ApiResponse> {
  try {
    const user = await knex("users").select("*").where({ email }).first();
    if (!user)
      return errorResponse(
        "Email or password is incorrect",
        user,
        ErrorCode.INVALID_CREDENTIALS
      );
    if (!user.password)
      return errorResponse(
        "Password not set",
        undefined,
        ErrorCode.INVALID_CREDENTIALS
      );

    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword)
      return errorResponse(
        "Email or password is incorrect",
        undefined,
        ErrorCode.INVALID_CREDENTIALS
      );
    // ensure(isValidPassword, "Invalid credentials");

    // Fetch user's companies and roles
    const roles: LoginRole[] = await knex("users_companies_roles")
      .where({ user_id: user.id })
      .select("company_id", "role_id");
    if (!roles.length)
      return errorResponse("No roles assigned", undefined, ErrorCode.NO_ROLES);

    let currentCompanyId = "";
    currentCompanyId = user.last_active_company_id || roles[0].company_id;

    const company = await getSingleCompany(currentCompanyId);
    if (!company.success) {
      return errorResponse("Unable to resolve company");
    }
    currentCompanyId = company.data.id;

    const userData = {
      id: user.id,
      currentCompanyId,
      email: user.email,
      firstname: user.firstname,
      ...(user.lastname && { lastname: user.lastname }),
      status: user.status!,
    };

    const { id, ...rest } = userData;

    const { accessToken, refreshToken } = generateAuthTokens({
      sub: id,
      ...rest,
    });
    await redis.setex(`refreshToken:${user.id}`, 604800, refreshToken); // 7 days

    return successResponse("User logged in successfully", {
      accessToken,
      refreshToken,
      user: {
        ...userData,
        companyRoles: roles.map((r) => ({
          companyId: r.company_id,
          roleId: r.role_id,
        })),
      },
      currentCompanyId,
      slug: company.data.assignedFirmSlug,
      company: company.data,
    });
  } catch (error) {
    return errorResponse("An unexpected error occurred");
  }
}

export async function refreshTokenService(
  refreshToken: string,
  userId: string
): Promise<ApiResponse> {
  const lockKey = `refreshLock:${userId}`;
  const locked = await redis.set(lockKey, "1", "PX", 1000, "NX");
  if (!locked) throw new Error("Refresh already in progress");

  try {
    const decoded = jwt.verify(
      refreshToken,
      JWT_CONFIG.refreshToken.secret
    ) as DecodedToken;

    if (decoded.sub !== userId) {
      return errorResponse("Invalid refresh token");
    }

    // Check Redis for token validity
    const storedToken = await redis.get(`refreshToken:${userId}`);
    if (storedToken !== refreshToken) {
      return errorResponse("Refresh token revoked or invalid");
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens({
      sub: userId,
      currentCompanyId: decoded.currentCompanyId,
      email: decoded.email,
      firstname: decoded.firstname,
      lastname: decoded.lastname,
      status: decoded.status,
    });

    // Rotate refresh token in Redis
    await redis.setex(`refreshToken:${userId}`, 604800, newRefreshToken); // 7 days

    return successResponse("Tokens refreshed", {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: userId, currentCompanyId: decoded.currentCompanyId },
    });
  } catch (error) {
    console.error("refreshTokenService error:", error);
    return errorResponse("Failed to refresh token");
  } finally {
    await redis.del(lockKey).catch((err) => {
      console.error("Failed to delete Redis lock:", err);
    });
  }
}
