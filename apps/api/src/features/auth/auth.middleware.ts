import { type NextFunction, type Response } from 'express';
import jwt from 'jsonwebtoken';

import { redis } from '../../lib/redis.js';
import { updateRequestContext } from '../../shared/telemetry/request-context.js';
import { errorResponse } from '../../shared/utils/response.utils.js';
import { publicPaths } from './auth.constants.js';
import {
  type AuthRequest,
  type BaseAuthRequest,
  type DecodedToken,
} from './auth.types.js';
import { csrfProtection, JWT_CONFIG } from './auth.utils.js';

export const verifyAccessToken = async (
  req: BaseAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.cookies?.accessToken;
  if (!token)
    return res
      .status(401)
      .json(errorResponse('Unauthorized', 'Token not found'));

  try {
    // Verify the JWT and extract the decoded payload
    const decoded = jwt.verify(
      token,
      JWT_CONFIG.accessToken.secret,
    ) as DecodedToken;

    // Ensure the decoded payload includes a valid user ID
    if (!decoded.sub)
      return res
        .status(403)
        .json(
          errorResponse('Invalid token payload', 'User ID not found in token'),
        );

    req.user = {
      ...req.user,
      id: decoded.sub,
    };
    updateRequestContext({ userId: decoded.sub });

    // proceed
    next();
  } catch (error) {
    handleJwtError(error, res);
  }
};

function handleJwtError(err: unknown, res: Response) {
  if (err instanceof jwt.TokenExpiredError) {
    return res.status(401).json(errorResponse('Token expired', err.message));
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return res.status(403).json(errorResponse('Invalid token', err.message));
  }
  res.status(500).json(errorResponse('Authentication failed', err));
}

export const verifyRefreshToken = async (
  req: BaseAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json(errorResponse('No refresh token provided'));
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      JWT_CONFIG.refreshToken.secret,
    ) as DecodedToken;

    if (!decoded.sub) {
      return res
        .status(403)
        .json(
          errorResponse('Invalid refresh token payload', 'User ID not found'),
        );
    }

    req.user = {
      ...req.user,
      id: decoded.sub,
    };
    updateRequestContext({ userId: decoded.sub });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json(errorResponse('Refresh token expired', error));
    }
    return res.status(403).json(errorResponse('Invalid refresh token', error));
  }
};

export const verifySessionToken = async (
  req: BaseAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const accessToken = req.cookies?.accessToken;
  if (accessToken) {
    try {
      const decoded = jwt.verify(
        accessToken,
        JWT_CONFIG.accessToken.secret,
      ) as DecodedToken;

      if (!decoded.sub) {
        return res
          .status(403)
          .json(
            errorResponse(
              'Invalid token payload',
              'User ID not found in token',
            ),
          );
      }

      req.user = {
        ...req.user,
        id: decoded.sub,
      };
      updateRequestContext({ userId: decoded.sub });

      return next();
    } catch (error) {
      if (
        !(error instanceof jwt.TokenExpiredError) &&
        !(error instanceof jwt.JsonWebTokenError)
      ) {
        return res
          .status(500)
          .json(errorResponse('Authentication failed', error));
      }
    }
  }

  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    return res
      .status(401)
      .json(errorResponse('Unauthorized', 'Token not found'));
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      JWT_CONFIG.refreshToken.secret,
    ) as DecodedToken;

    if (!decoded.sub) {
      return res
        .status(403)
        .json(
          errorResponse('Invalid refresh token payload', 'User ID not found'),
        );
    }

    const isValidSession = await redis.sismember(
      `refreshTokens:${decoded.sub}`,
      refreshToken,
    );

    if (!isValidSession) {
      return res.status(403).json(errorResponse('Invalid session'));
    }

    req.user = {
      ...req.user,
      id: decoded.sub,
    };
    updateRequestContext({ userId: decoded.sub });

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json(errorResponse('Refresh token expired', error));
    }
    return res.status(403).json(errorResponse('Invalid refresh token', error));
  }
};

export const conditionalCsrf = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  csrfProtection(req, res, (err) => {
    const isPublic = publicPaths.some((p) => req.originalUrl.includes(p));

    // Ignore CSRF errors on public routes
    if (err && isPublic) return next();

    if (err) {
      console.warn(
        'Blocked by CSRF middleware (Invalid CSRF token):',
        err.message,
      );
      return res.status(403).json({ error: 'A security breach was detected' });
    }

    return next();
  });
};

export const requireAuth = async (
  req: BaseAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (publicPaths.some((p) => req.originalUrl.includes(p))) {
    return next();
  }

  const token = req.cookies?.accessToken;
  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    } else {
      return res.status(401).json(errorResponse('Unauthorized'));
    }
  }

  try {
    await verifyAccessToken(req, res, next);
  } catch (error) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    } else {
      return res.status(401).json(errorResponse('Unauthorized'));
    }
  }
};
// export const requirePermission = (permission: string) => {
//   return async (req: AuthRequest, res: Response, next: NextFunction) => {
//     if (!req.user) return res.status(401).json(errorResponse("Unauthorized"));

//     const currentCompanyId = req.user.currentCompanyId || req.params.companyId;
//     if (!currentCompanyId) {
//       return res.status(400).json(errorResponse("Company ID not provided"));
//     }

//     const role = req.user.companyRoles?.find(
//       (r) => r.companyId === currentCompanyId
//     );
//     if (!role) {
//       return res
//         .status(403)
//         .json(errorResponse("Not authorized for this company"));
//     }

//     // Redis Cache
//     const cacheKey = `permissions:${role.roleId}`;
//     const cached = await redis.get(cacheKey);
//     let permissions: string[];

//     if (cached) {
//       permissions = JSON.parse(cached);
//     } else {
//       const result = await getPermissionsForRole(role.roleId);
//       if (!result.success)
//         return res.status(403).json(errorResponse("No permissions found"));

//       permissions = result.data.map(
//         (p: { permission: string }) => p.permission
//       );

//       await redis.setex(cacheKey, 3600, JSON.stringify(permissions)); // Cache for 1hr
//     }

//     if (!permissions.includes(permission)) {
//       return res.status(403).json(errorResponse("Forbidden"));
//     }

//     req.user.permissions = permissions.map((p) => ({ permission: p }));
//     next();
//   };
// };
