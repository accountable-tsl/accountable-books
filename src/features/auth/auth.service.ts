import jwt from "jsonwebtoken";
import { buildAuthContext, generateAuthTokens, JWT_CONFIG } from "./auth.utils";
import { DecodedToken } from "./auth.types";
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
import { getCompanyShortCode } from "../../shared/utils/random.utils";

export async function loginService(
  email: string,
  password: string
): Promise<ApiResponse> {
  try {
    const user = await knex("users").select("*").where({ email }).first();
    if (!user)
      return errorResponse(
        "Email or password is incorrect",
        undefined,
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

    // Fetch user's companies and roles
    const roles = await knex("users_companies_roles")
      .where({ user_id: user.id })
      .select("company_id", "role_id");
    if (!roles.length)
      return errorResponse("No roles assigned", undefined, ErrorCode.NO_ROLES);

    const currentCompanyId = await getCompanyShortCode(
      user.last_active_company_id || roles[0].company_id
    );

    const userData = {
      sub: user.id,
      currentCompanyId,
      email: user.email,
      firstname: user.firstname,
      ...(user.lastname && { lastname: user.lastname }),
      status: user.status!,
    };

    const { accessToken, refreshToken } = generateAuthTokens(userData);
    const result = await buildAuthContext(userData);

    // Add refreshToken to Redis set
    const tokenCount = await redis.scard(`refreshTokens:${user.id}`);
    if (tokenCount >= 5) {
      const oldestToken = await redis.spop(`refreshTokens:${user.id}`);
    }
    await redis.sadd(`refreshTokens:${user.id}`, refreshToken);
    await redis.expire(`refreshTokens:${user.id}`, 604800); // 7 days

    return successResponse("User logged in successfully", {
      accessToken,
      refreshToken,
      user: result.user,
      company: result.company,
    } as const);
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

    // Check if refreshToken exists in Redis set
    const isValidToken = await redis.sismember(
      `refreshTokens:${userId}`,
      refreshToken
    );

    if (!isValidToken) {
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

    // Rotate refreshToken in Redis set
    await redis.srem(`refreshTokens:${userId}`, refreshToken); // Remove old
    await redis.sadd(`refreshTokens:${userId}`, newRefreshToken); // Add new
    await redis.expire(`refreshTokens:${userId}`, 604800); // Reset TTL

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
