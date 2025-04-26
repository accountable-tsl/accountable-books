import { NextFunction, Request, Response } from "express";
import { JWT_CONFIG } from "./auth.utils";
import jwt from "jsonwebtoken";
import { AuthRequest, DecodedToken } from "./auth.types";
import { getCompanyRolesForUser } from "../../domains/userCompanyRole/userCompanyRole.model";
import { errorResponse } from "../../shared/utils/response.utils";
import { getPermissionsForRole } from "../../domains/permission/permission.model";
import { redis } from "../../lib/redis";

export const verifyAccessToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Extract the access token from cookies
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json(errorResponse("Unauthorized"));
  }

  // Verify token
  try {
    // Verify the JWT and extract the decoded payload
    const decoded = jwt.verify(
      token,
      JWT_CONFIG.accessToken.secret
    ) as DecodedToken;

    // Ensure the decoded payload includes a valid user ID
    if (!decoded.sub)
      return res.status(403).json(errorResponse("Invalid token payload"));

    // Fetch all roles the user has across companies
    const roles = await getCompanyRolesForUser(decoded.sub);
    if (!roles.success) return res.status(403).json(roles.message);

    // Attach user ID and company roles to the request object
    req.user = {
      id: decoded.sub,
      currentCompanyId: decoded.companyId,
      companyRoles: roles.data,
    };

    // proceed
    next();
  } catch (error) {
    handleJwtError(error, res);
  }
};

function handleJwtError(err: unknown, res: Response) {
  if (err instanceof jwt.TokenExpiredError) {
    return res.status(401).json(errorResponse("Token expired"));
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return res.status(403).json(errorResponse("Invalid token"));
  }
  res.status(500).json(errorResponse("Authentication failed"));
}

export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json(errorResponse("Unauthorized"));

    const currentCompanyId = req.user.currentCompanyId || req.params.companyId;
    if (!currentCompanyId) {
      return res.status(400).json(errorResponse("Company ID not provided"));
    }

    const role = req.user.companyRoles?.find(
      (r) => r.company_id === currentCompanyId
    );
    if (!role) {
      return res
        .status(403)
        .json(errorResponse("Not authorized for this company"));
    }

    // Redis Cache
    const cacheKey = `permissions:${role.role_id}`;
    const cached = await redis.get(cacheKey);
    let permissions: string[];

    if (cached) {
      permissions = JSON.parse(cached);
    } else {
      const result = await getPermissionsForRole(role.role_id);
      if (!result.success)
        return res.status(403).json(errorResponse("No permissions found"));

      permissions = result.data.map(
        (p: { permission: string }) => p.permission
      );

      await redis.setex(cacheKey, 3600, JSON.stringify(permissions)); // Cache for 1hr
    }

    if (!permissions.includes(permission)) {
      return res.status(403).json(errorResponse("Forbidden"));
    }

    req.user.permissions = permissions.map((p) => ({ permission: p }));
    next();
  };
};

export const verifyRefreshToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json(errorResponse("No refresh token provided"));
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      JWT_CONFIG.refreshToken.secret
    ) as { sub: string };
    if (!decoded.sub) {
      return res.status(403).json(errorResponse("Invalid refresh token"));
    }

    req.user = { id: decoded.sub };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json(errorResponse("Refresh token expired"));
    }
    return res.status(403).json(errorResponse("Invalid refresh token"));
  }
};
