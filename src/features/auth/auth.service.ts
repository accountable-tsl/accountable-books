import jwt from "jsonwebtoken";
import { generateAuthTokens, JWT_CONFIG } from "./auth.utils";
import { LoginRole, TokenExpiration } from "./auth.types";
import knex from "../../../knexClient";
import {
  ensure,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { comparePassword } from "../../shared/utils/crypto.utils";
import { ApiResponse } from "../../core/types/api.types";
import { redis } from "../../lib/redis";

export async function loginService(
  email: string,
  password: string
): Promise<ApiResponse> {
  try {
    const user = await knex("users").select("*").where({ email }).first();
    if (!user) return errorResponse("Invalid credentials", user);
    if (!user.password)
      return errorResponse("Password not set (maybe invited user)");

    const isValidPassword = await comparePassword(password, user.password);
    ensure(isValidPassword, "Invalid credentials");

    // Fetch user's companies and roles
    const roles: LoginRole[] = await knex("users_companies_roles")
      .where({ user_id: user.id })
      .select("company_id", "role_id");
    ensure(roles.length, "No roles assigned to this user within any company");

    const currentCompanyId = user.last_active_company_id || roles[0].company_id;
    const { accessToken, refreshToken } = generateAuthTokens({
      id: user.id,
      currentCompanyId,
    });
    return successResponse("User logged in successfully", {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        companyRoles: roles.map((r) => ({
          companyId: r.company_id,
          roleId: r.role_id,
        })),
      },
      currentCompanyId,
    });
  } catch (error) {
    return errorResponse("An unexpected error occurred");
  }
}

export async function refreshTokenService(
  refreshToken: string,
  userId: string,
  currentCompanyId: string
): Promise<ApiResponse> {
  try {
    const decoded = jwt.verify(
      refreshToken,
      JWT_CONFIG.refreshToken.secret
    ) as { sub: string };
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
      id: userId,
      currentCompanyId,
    });

    // Rotate refresh token in Redis
    await redis.setex(`refreshToken:${userId}`, 604800, newRefreshToken); // 7 days

    return successResponse("Tokens refreshed", {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: userId, currentCompanyId },
    });
  } catch (error) {
    return errorResponse("Failed to refresh token");
  }
}
