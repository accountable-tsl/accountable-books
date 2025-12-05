import { type Request, type Response } from 'express';

import { ENV, isProd } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  loginService,
  meService,
  refreshTokenService,
  resendVerificationEmailService,
  verifyEmailService,
} from './auth.service.js';
import { type AuthRequest } from './auth.types.js';
import {
  clearCsrfCookie,
  generateCsrfToken,
  setAuthCookies,
} from './auth.utils.js';

export async function loginController(req: AuthRequest, res: Response) {
  try {
    const { email, password } = req.body;

    const serviceRes = await loginService(email, password);

    if (!serviceRes.success || !serviceRes.data) {
      const status =
        serviceRes?.code === ErrorCode.INVALID_CREDENTIALS
          ? 401
          : serviceRes?.code === ErrorCode.GENERIC
            ? 500
            : 403;
      return res
        .status(status)
        .json(errorResponse(serviceRes.message, serviceRes.data || undefined));
    }
    const { accessToken, refreshToken, ...rest } = serviceRes.data;
    setAuthCookies(req, res, accessToken, refreshToken);

    req.company = rest.activeCompany;
    req.user = rest.user;
    const csrfToken = generateCsrfToken(req, res);

    return res.json(
      successResponse('User logged in successfully', {
        user: rest.user,
        csrfToken,
      }),
    );
  } catch (error) {
    return res.status(500).json(errorResponse('Something went wrong', error));
  }
}

export async function refreshTokenController(req: AuthRequest, res: Response) {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json(errorResponse('Refresh token missing'));
    }

    const { id: userId } = req.user || {};

    if (!userId) {
      return res.status(403).json(errorResponse('User not authenticated'));
    }

    const result = await refreshTokenService(refreshToken, userId);

    if (!result.success || !result.data) {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res
        .status(403)
        .json(errorResponse('Refresh token validation failed', result));
    }

    const { accessToken, refreshToken: newRefreshToken } = result.data;

    setAuthCookies(req, res, accessToken, newRefreshToken);
    const csrfToken = generateCsrfToken(req, res);

    return res.json(successResponse('Tokens refreshed', { csrfToken }));
  } catch (error) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    clearCsrfCookie(res);

    return res.status(401).json({
      code: 'REFRESH_FAILED',
      message: 'Session expired - please login again',
    });
  }
}

export async function logoutController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  if (userId) {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await redis.srem(`refreshTokens:${userId}`, refreshToken);
    }
  }

  const cookieDomain = ENV.COOKIE_DOMAIN;
  const clearCookieOptions = {
    domain: cookieDomain,
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
  };

  res.clearCookie('accessToken', clearCookieOptions);
  res.clearCookie('refreshToken', clearCookieOptions);
  clearCsrfCookie(res);

  return res.status(200).json(successResponse('Logged out successfully', null));
}

export async function meController(req: AuthRequest, res: Response) {
  if (!req.user?.id) {
    return res.status(401).json(errorResponse('Not authenticated'));
  }

  const context = await meService(req.user.id);

  if (!context.success || !context.data) {
    const status =
      context?.code === ErrorCode.INVALID_CREDENTIALS
        ? 401
        : context?.code === ErrorCode.GENERIC
          ? 500
          : 403;
    return res
      .status(status)
      .json(errorResponse(context.message, context.data || undefined));
  }

  const { user, activeCompany } = context.data;

  // I want to attach company data to req.company but not return it in the response
  req.company = activeCompany;
  req.user = user;

  return res.status(200).json(
    successResponse('User retrieved successfully', {
      user: user,
      csrfToken: generateCsrfToken(req, res),
    }),
  );
}

export async function verifyEmailController(req: Request, res: Response) {
  const { token, userId } = req.body;

  if (!token && !userId) {
    return res.status(400).json(
      errorResponse('Missing required parameters', {
        emailVerified: false,
        status: 'error',
      }),
    );
  }

  try {
    const result = await verifyEmailService({
      token: String(token),
      userId: String(userId),
    });

    return result.success
      ? res.status(200).json(result)
      : res.status(400).json(result);
  } catch (error) {
    return res.status(500).json(
      errorResponse('Something went wrong', {
        emailVerified: false,
        status: 'error',
      }),
    );
  }
}

export async function resendVerEmailController(
  req: AuthRequest,
  res: Response,
) {
  const userId = String(req.body.userId);
  if (!userId) {
    return res.status(400).json(errorResponse('User email or id is required'));
  }

  if (!userId && typeof !userId !== 'string') {
    return res.status(400).json(errorResponse('Invalid email format'));
  }

  try {
    const result = await resendVerificationEmailService({
      userId,
    });

    if (!result.success) {
      const status = result.message === 'User not found' ? 404 : 400;
      return res.status(status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse('Something went wrong'));
  }
}
