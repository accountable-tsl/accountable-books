import jwt from 'jsonwebtoken';
import { buildAuthContext, generateAuthTokens, JWT_CONFIG } from './auth.utils.js';
import {
  type AuthCompanyContext,
  type AuthUserContext,
  type DecodedToken,
  type ResendVerificationEmailInput,
  type VerifyEmailInput,
} from './auth.types.js';
import { knexClient } from '../../db/knexClient.js';
import { ErrorCode, errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import {
  comparePassword,
  compareToken,
  generateRandomToken,
  hashToken,
} from '../../shared/utils/crypto.utils.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { redis } from '../../lib/redis.js';
import dayjs from 'dayjs';
import { buildEmailServiceUrl } from '../../features/communications/email/email.utils.js';
import { sendVerificationEmail } from '../../features/communications/email/email.service.js';
import { type UserOnboardingState } from '../../features/onboarding/onboarding.types.js';
import { addNewToken, getUserToken } from '../../domains/tokens/tokens.model.js';
import { markUserOnboardingStepComplete } from '../../features/onboarding/onboarding.utils.js';
import { getCompanyShortCode } from '../../shared/utils/random.utils.js';

export async function loginService(
  email: string,
  password: string,
): Promise<
  ApiResponse<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserContext;
    activeCompany: AuthCompanyContext;
  }>
> {
  try {
    // Look up user by email
    const user = await knexClient('users').select('*').where({ email }).first();
    if (!user) {
      // If no user found, fail with invalid credentials error
      return errorResponse('Email or password is incorrect', undefined, {
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }

    if (!user.password) {
      // If user has no password set (e.g. invited but not registered), fail
      return errorResponse('Password not set', undefined, {
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }

    // Check password matches hashed password in DB
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword)
      return errorResponse('Email or password is incorrect', undefined, {
        code: ErrorCode.INVALID_CREDENTIALS,
      });

    // Build token payload (user ID, email, company info, etc.)
    const userData: DecodedToken = {
      sub: user.id,
      email: user.email,
      firstname: user.firstname,
      ...(user.lastname && { lastname: user.lastname }),
      emailVerifiedAt: user.email_verified_at || null,
      onboardingState: user.onboarding_state as UserOnboardingState,
      currentCompanyId: user.last_active_company_id || undefined, // Let buildAuthContext finalize company
    };

    // Fetch extra user + company info for frontend (enriched context)
    const contextRes = await buildAuthContext(userData);

    if (!contextRes.success || !contextRes.data) {
      return errorResponse(contextRes.message || 'Failed to build auth context');
    }
    const { user: userContext, activeCompany } = contextRes.data;

    // Generate short-lived access token + long-lived refresh token
    const { accessToken, refreshToken } = generateAuthTokens(userData);

    // Add refreshToken to Redis set
    const tokenCount = await redis.scard(`refreshTokens:${user.id}`);
    if (tokenCount >= 5) {
      // Remove oldest token if token count for this user exceeds 5
      await redis.spop(`refreshTokens:${user.id}`);
    }
    await redis.sadd(`refreshTokens:${user.id}`, refreshToken);
    await redis.expire(`refreshTokens:${user.id}`, 604800); // 7 days

    return successResponse('Login successful', {
      accessToken,
      refreshToken,
      user: userContext,
      activeCompany,
    });
  } catch (error) {
    return errorResponse('An unexpected error occurred', error);
  }
}

export async function refreshTokenService(
  refreshToken: string,
  userId: string,
): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
  const lockKey = `refreshLock:${userId}`;
  const locked = await redis.set(lockKey, '1', 'PX', 1000, 'NX');
  if (!locked) throw new Error('Refresh already in progress');

  try {
    const decoded = jwt.verify(refreshToken, JWT_CONFIG.refreshToken.secret) as DecodedToken;

    if (decoded.sub !== userId) {
      return errorResponse('Invalid refresh token');
    }

    // Check if refreshToken exists in Redis set
    const isValidToken = await redis.sismember(`refreshTokens:${userId}`, refreshToken);

    if (!isValidToken) {
      return errorResponse('Refresh token revoked or invalid');
    }
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens({
      sub: userId,
      currentCompanyId: decoded.currentCompanyId,
      email: decoded.email,
      firstname: decoded.firstname,
      lastname: decoded.lastname,
      emailVerifiedAt: decoded.emailVerifiedAt,
      onboardingState: decoded.onboardingState,
    });

    // Rotate refreshToken in Redis set
    await redis.srem(`refreshTokens:${userId}`, refreshToken); // Remove old
    await redis.sadd(`refreshTokens:${userId}`, newRefreshToken); // Add new
    await redis.expire(`refreshTokens:${userId}`, 604800); // Reset TTL

    return successResponse('Tokens refreshed', {
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('refreshTokenService error:', error);
    return errorResponse('Failed to refresh token');
  } finally {
    await redis.del(lockKey).catch((err: any) => {
      console.error('Failed to delete Redis lock:', err);
    });
  }
}

export async function verifyEmailService(input: VerifyEmailInput): Promise<
  ApiResponse<{
    emailVerified: boolean;
    status: 'verified' | 'invalid_or_expired' | 'error';
    email: string | null;
  }>
> {
  const { token, userId } = input;

  if (!token && !userId) {
    return errorResponse('Missing required parameters', {
      emailVerified: false,
      status: 'error',
      email: null,
    });
  }

  try {
    const result: ApiResponse<{
      emailVerified: boolean;
      status: 'verified' | 'invalid_or_expired' | 'error';
      email: string | null;
    }> = await knexClient.transaction(async (trx) => {
      // Is email already verified?
      const user = await trx('users')
        .where({ id: userId, is_deleted: false })
        .select('id', 'email', 'email_verified_at', 'onboarding_state')
        .first();

      const {
        email_verified_at: initialEmailVerifiedAt,
        onboarding_state: initialOnboardingState,
        email: userEmail,
      } = user || {};

      if (!user || !userEmail) {
        return errorResponse('User not found', {
          emailVerified: false,
          status: 'error',
          email: null,
        });
      }

      let newOnboardingState;
      if (initialOnboardingState) {
        newOnboardingState = markUserOnboardingStepComplete(
          initialOnboardingState,
          'email_verified',
        );
      }

      if (initialEmailVerifiedAt && !initialOnboardingState?.steps.email_verified) {
        await trx('users').where({ id: userId }).update({ onboarding_state: newOnboardingState });
      }

      if (initialEmailVerifiedAt) {
        return successResponse<{
          emailVerified: boolean;
          status: 'verified' | 'invalid_or_expired' | 'error';
          email: string | null;
        }>('Email already verified', {
          emailVerified: true,
          status: 'verified',
          email: userEmail,
        });
      }

      const tokenHashRes = await getUserToken({
        userId: user.id,
        tokenType: 'email_verification',
      });

      const { id: tokenId, token_hash: tokenHash } = tokenHashRes.data || {};

      if (!tokenHashRes.success || !tokenHash || !token) {
        return errorResponse('Invalid or expired token', {
          emailVerified: false,
          status: 'invalid_or_expired',
          email: null,
        });
      }

      // Compare token received with the hashed one in the database
      const verifyToken = await compareToken({
        token,
        hash: tokenHash,
      });

      if (!verifyToken)
        return errorResponse('Invalid or expired token', {
          emailVerified: false,
          status: 'invalid_or_expired',
          email: null,
        });

      // Verified token, update user
      await trx('users')
        .where({ id: userId })
        .update({
          email_verified_at: new Date(),
          ...(newOnboardingState ? { onboarding_state: newOnboardingState } : {}),
        });

      await trx('tokens').where({ id: tokenId }).delete();

      return successResponse<{
        emailVerified: boolean;
        status: 'verified' | 'invalid_or_expired' | 'error';
        email: string | null;
      }>('Email verified', {
        emailVerified: true,
        status: 'verified',
        email: userEmail,
      });
    });

    // const slugs = await knexClient("user_company_roles as ucr")
    //   .select(["af.slug as slug", "c.created_by_id as creatorId"])
    //   .join("companies as c", "ucr.company_id", "c.id")
    //   .join("accounting_firms_meta as af", "c.assigned_firm_id", "af.id")
    //   .where("ucr.user_id", user.id);

    // We prefer to return a slug for the company the user *created* (if any),
    // since this is likely their primary or most important company.
    // If the user didn't create any companies, we fallback to any valid company slug.

    // let slugToReturn: string | null = null;
    // if (slugs.length > 0) {
    //   const createdCompany = slugs.find((s) => s.creatorId === user.id);
    //   if (createdCompany) {
    //     slugToReturn = createdCompany.slug;
    //   } else {
    //     slugToReturn = slugs[0].slug;
    //   }
    // }

    return result;
  } catch (error: any) {
    return errorResponse('Failed to verify email', {
      emailVerified: false,
      status: 'error',
      email: null,
    });
  }
}

export async function resendVerificationEmailService(
  input: ResendVerificationEmailInput,
): Promise<ApiResponse> {
  if (!input.userId) {
    return errorResponse('Missing required parameters');
  }

  try {
    // Get user details
    const user = await knexClient('users')
      .select('id', 'email', 'firstname', 'email_verified_at', 'onboarding_state')
      .where({ id: input.userId })
      .first();

    if (!user) {
      return errorResponse('User not found');
    }

    if (user && user.email_verified_at) {
      return errorResponse('Email already verified');
    }

    const token = generateRandomToken();
    const hashedToken = await hashToken(token);
    const expiry = dayjs().add(24, 'hours').toDate();

    const tokenRes = await addNewToken({
      user_id: user.id,
      token_type: 'email_verification',
      token_hash: hashedToken,
      expires_at: expiry,
    });

    const url = buildEmailServiceUrl('verify-email', {
      userId: user.id,
      token,
    });

    const sendEmail = await sendVerificationEmail({
      to: user.email,
      name: user.firstname,
      url,
    });

    if (!sendEmail) {
      errorResponse('Unable to send verification email', sendEmail, {
        code: ErrorCode.GENERIC,
        report: true,
      });
    }

    return successResponse('Verification email sent', user.email);
  } catch (error) {
    return errorResponse('Failed to resend verification email');
  }
}

export async function meService(userId: string): Promise<
  ApiResponse<{
    user: AuthUserContext;
    activeCompany: AuthCompanyContext;
  }>
> {
  try {
    const user = await knexClient('users').select('*').where({ id: userId }).first();
    if (!user) {
      // If no user found, fail with invalid credentials error
      return errorResponse('Invalid credentials', undefined, {
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }

    const shortCode = await getCompanyShortCode(user.last_active_company_id);

    const userData: DecodedToken = {
      sub: user.id,
      email: user.email,
      firstname: user.firstname,
      ...(user.lastname && { lastname: user.lastname }),
      emailVerifiedAt: user.email_verified_at || null,
      onboardingState: user.onboarding_state as UserOnboardingState,
      currentCompanyId: shortCode || undefined, // Let buildAuthContext finalize company
    };

    const contextResponse = await buildAuthContext(userData);

    if (!contextResponse.success || !contextResponse.data) {
      return errorResponse(contextResponse.message || 'Failed to build auth context');
    }

    const { user: userContext, activeCompany } = contextResponse.data;

    return successResponse('User retrieved successfully', {
      user: userContext,
      activeCompany,
    });
  } catch (error) {
    return errorResponse('Something went wrong', error);
  }
}
