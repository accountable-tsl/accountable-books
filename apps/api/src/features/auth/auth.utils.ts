import { doubleCsrf } from 'csrf-csrf';
import { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';

import { ENV, isProd } from '../../config/env.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { getAccessibleCompaniesForUser } from '../../domains/userRoles/userRoles.model.js';
import { getOnboardingState } from '../../features/onboarding/onboarding.service.js';
import { getCompanyUUID } from '../../shared/utils/random.utils.js';
import {
  AppError,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import type {
  AuthCompanyContext,
  AuthUserContext,
  DecodedToken,
  TokenConfig,
} from './auth.types.js';
import { TokenExpiration } from './auth.types.js';

if (!ENV.JWT_ACCESS_SECRET || !ENV.JWT_REFRESH_SECRET) {
  throw new AppError('JWT secrets must be defined in .env');
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
  if (
    !payload.sub ||
    !JWT_CONFIG.accessToken.secret ||
    !JWT_CONFIG.refreshToken.secret
  ) {
    throw new Error('Invalid payload or missing JWT secrets');
  }

  const accessToken = jwt.sign(payload, JWT_CONFIG.accessToken.secret, {
    expiresIn: TokenExpiration.Access,
  });

  const refreshToken = jwt.sign(payload, JWT_CONFIG.refreshToken.secret, {
    expiresIn: TokenExpiration.Refresh,
  });

  return { accessToken, refreshToken };
};

if (!ENV.CSRF_SECRET || !ENV.COOKIE_DOMAIN)
  throw new Error('CSRF secret must be defined');

const cookieDomain = ENV.COOKIE_DOMAIN;

export const setAuthCookies = (
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  const cookieOptions = {
    domain: cookieDomain,
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/',
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// export const csrfProtection = csurf({
//   cookie: {
//     httpOnly: true,
//     secure: isProd,
//     sameSite:  "none",
//     domain: cookieDomain,
//     path: "/",
//   },
// });

export const {
  doubleCsrfProtection: csrfProtection, // The main middleware for protecting routes
  invalidCsrfTokenError, // For convenient error checking
  generateCsrfToken, // Function to generate and provide the token to the client
} = doubleCsrf({
  getSecret: () => ENV.CSRF_SECRET!,
  cookieName: isProd ? '__Host-csrf' : 'csrf-token',
  getSessionIdentifier: () => 'anonymous_stateless_identifier',

  cookieOptions: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    domain: cookieDomain,
    path: '/',
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

export const clearCsrfCookie = (res: Response) => {
  const cookieNameToClear = isProd ? '__Host-csrf' : 'csrf-token';
  res.clearCookie(cookieNameToClear, {
    domain: cookieDomain,
    path: '/',
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
  });
};

export async function buildAuthContext(
  decoded: DecodedToken,
): Promise<
  ApiResponse<{ user: AuthUserContext; activeCompany: AuthCompanyContext }>
> {
  try {
    const {
      sub,
      email,
      firstname,
      lastname,
      emailVerifiedAt,
      currentCompanyId,
      onboardingState,
    } = decoded;

    if (!sub) return errorResponse('Invalid token payload, missing user ID');
    // Sub is user ID
    const userAccessProfileResponse = await getAccessibleCompaniesForUser({
      userId: sub,
    });
    if (!userAccessProfileResponse.success || !userAccessProfileResponse.data)
      return errorResponse(userAccessProfileResponse.message);

    const userAccessProfile = userAccessProfileResponse.data;
    const accessibleCompanies = userAccessProfile.accessibleCompanies;
    const accessibleCompaniesIds = userAccessProfile.accessibleCompanies.map(
      (c) => c.id,
    );

    // Determine valid current company
    let activeCompanyId = currentCompanyId;
    if (!activeCompanyId || !accessibleCompaniesIds.includes(activeCompanyId)) {
      activeCompanyId = accessibleCompaniesIds[0];
      // Update last_active_company_id
      const activeCompanyUUID = await getCompanyUUID(activeCompanyId);
      await knexClient('users')
        .where('id', sub)
        .update('last_active_company_id', activeCompanyUUID);
    }

    const activeCompany = accessibleCompanies.find(
      (c) => c.id === activeCompanyId,
    );
    if (!activeCompany) {
      return errorResponse('Active company not found');
    }

    const onboardingStatus = await getOnboardingState({
      user: {
        id: sub,
        emailVerifiedAt,
        isPlatformUser: userAccessProfile.isPlatformUser,
        onboardingState,
      },
      company: activeCompany,
    });

    // Build user context
    const user: AuthUserContext = {
      id: sub,
      email,
      firstname,
      lastname,

      ...(userAccessProfile.isPlatformUser && userAccessProfile.platformUserKey
        ? {
            isPlatformUser: userAccessProfile.isPlatformUser,
            platformUserKey: userAccessProfile.platformUserKey,
          }
        : {}),

      currentCompanyId: activeCompanyId,
      currentCompany: { ...activeCompany, onboarding: onboardingStatus },
      companies: accessibleCompanies,
      // permissions: to be handled later (to be added to companies)
    };

    return successResponse('Auth context built successfully', {
      user,
      activeCompany,
    });
  } catch (error) {
    return errorResponse('Something went wrong', error);
  }
}
