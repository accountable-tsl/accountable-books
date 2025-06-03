import jwt from "jsonwebtoken";
import { buildAuthContext, generateAuthTokens, JWT_CONFIG } from "./auth.utils";
import {
  DecodedToken,
  ResendEmailParams,
  VerifyEmailParams,
} from "./auth.types";
import knex from "../../../knexClient";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  comparePassword,
  compareToken,
  generateRandomToken,
  hashToken,
} from "../../shared/utils/crypto.utils";
import { ApiResponse } from "../../core/types/api.types";
import { redis } from "../../lib/redis";
import { getCompanyShortCode } from "../../shared/utils/random.utils";
import dayjs from "dayjs";
import { buildEmailServiceUrl } from "../communications/email/email.utils";
import { sendVerificationEmail } from "../communications/email/email.service";

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

export async function verifyEmailService(
  params: VerifyEmailParams
): Promise<ApiResponse> {
  if (!params.token) return errorResponse("Missing token");
  const { token } = params;

  try {
    const user = await knex("users")
      .select("id", "email_verification_token_hash")
      .where((qb) => {
        if ("userId" in params) {
          qb.where("id", params.userId);
        } else {
          qb.where("email", params.email);
        }
      })
      .whereNotNull("email_verification_token_hash")
      .andWhere("email_verified_at", null)
      .andWhere("email_verification_expiry", ">", new Date())
      .first();

    if (!user || !user.email_verification_token_hash) {
      return errorResponse("Invalid or expired token");
    }

    const verifyToken = await compareToken(
      token,
      user?.email_verification_token_hash
    );

    if (!user || !verifyToken) return errorResponse("Invalid or expired token");

    const updatedUser = await knex("users")
      .returning(["id", "email", "email_verified"])
      .where({ id: user.id })
      .update({
        email_verified: true,
        email_verified_at: new Date(),
        email_verification_token_hash: null,
        email_verification_expiry: null,
      });

    return successResponse("Email verified successfully", updatedUser);
  } catch (error) {
    console.log(error);
    return errorResponse("Failed to verify email");
  }
}

export async function resendVerificationEmailService(
  params: ResendEmailParams
): Promise<ApiResponse> {
  if (!params.email && !params.userId) {
    return errorResponse("Missing email or userId");
  }

  try {
    // Get user details
    const user = await knex("users")
      .select(
        "id",
        "email",
        "email_verified",
        "email_verification_expiry",
        "email_verification_token_hash",
        "email_verified_at",
        "firstname"
      )
      .where((qb) => {
        if (params.userId) {
          qb.where("id", params.userId);
        } else {
          qb.where("email", params.email);
        }
      })
      .first();

    if (!user) {
      return errorResponse("User not found");
    }

    if (user.email_verified && user.email_verified_at) {
      return errorResponse("Email already verified");
    }

    const token = generateRandomToken();
    const hashedToken = await hashToken(token);

    await knex("users")
      .where({ id: user.id })
      .update({
        email_verification_token_hash: hashedToken,
        email_verification_expiry: dayjs().add(24, "hours").toDate(), // 24 hours
      });

    const url = buildEmailServiceUrl("verify-email", {
      token,
      slug: params.slug || "app",
      email: user.email,
    });
    const sendEmail = await sendVerificationEmail({
      to: user.email,
      name: user.firstname,
      url,
    });

    if (!sendEmail) {
      errorResponse(
        "Unable to send verification email",
        sendEmail,
        ErrorCode.GENERIC,
        true
      );
    }

    return successResponse("Verification email sent", user.email);
  } catch (error) {
    return errorResponse("Failed to resend verification email");
  }
}
