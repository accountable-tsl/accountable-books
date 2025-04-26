import { NextFunction, Request, Response } from "express";
import { JWT_CONFIG } from "./auth.utils";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AuthRequest, DecodedToken } from "./auth.types";
import { User } from "../../domains/user/user.types";
import { getCompanyRolesForUser } from "../../domains/userCompanyRole/userCompanyRole.model";
import { permission } from "process";

// export interface AuthRequest extends Request {
//   user?: User;
// }

export const verifyAccessToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // Extract the access token from cookies
  const token = req.cookies.accessToken as string | undefined;

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Verify token
  try {
    // Verify the JWT and extract the decoded payload
    const decoded = jwt.verify(
      token,
      JWT_CONFIG.accessToken.secret
    ) as DecodedToken;

    // Ensure the decoded payload includes a valid user ID
    if (!decoded.sub) {
      return res
        .status(403)
        .json({ success: false, message: "Invalid token payload" });
    }

    // Fetch all roles the user has across companies
    const userRoles = await getCompanyRolesForUser(decoded.sub);
    if (!userRoles.success) return res.status(403).json(userRoles.message);

    // Attach user ID and company roles to the request object
    req.user = { id: decoded.sub, roles: userRoles.data };

    // proceed
    next();
  } catch (error) {
    handleJwtError(error, res);
  }
};

function handleJwtError(err: unknown, res: Response) {
  if (err instanceof jwt.TokenExpiredError) {
    return res.status(401).json({ error: "Token expired" });
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return res.status(403).json({ error: "Invalid token" });
  }
  res.status(500).json({ error: "Authentication failed" });
}

export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const companyId = req.params.company_id || req.body.company_id;

    const userRole = req.user?.roles?.find((r) => r.company_id === companyId);

    if (!userRole) {
      return res.status(403).json({ message: "No role for this company" });
    }

    const permissions = await getPermissionsForRole(userRole.role_id);
  };
};
