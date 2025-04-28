import { Request, Response } from "express";
import { loginService, refreshTokenService } from "./auth.service";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { AuthRequest } from "./auth.types";
import { setAuthCookies } from "./auth.utils";
import { redis } from "../../lib/redis";

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const { success, code, message, data } = await loginService(
      email,
      password
    );
    if (!success) {
      const status =
        code === ErrorCode.INVALID_CREDENTIALS
          ? 401
          : code === ErrorCode.GENERIC
            ? 500
            : 403;
      return res
        .status(status)
        .json(errorResponse(message, undefined, code as ErrorCode));
    }
    const { accessToken, refreshToken, ...rest } = data;

    const csrfToken = setAuthCookies(req, res, accessToken, refreshToken);

    return res.json(
      successResponse("User logged in successfully", {
        ...rest,
        csrfToken,
      })
    );
  } catch (error) {
    return res.status(500).json(errorResponse("Something went wrong"));
  }
}

export async function refreshTokenController(req: AuthRequest, res: Response) {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json(errorResponse("Refresh token missing"));
    }

    const { id: userId, currentCompanyId } = req.user!;

    if (!userId) {
      return res.status(403).json(errorResponse("User not authenticated"));
    }

    const result = await refreshTokenService(refreshToken, userId);

    if (!result.success) {
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res
        .status(403)
        .json(errorResponse("Refresh token validation failed", result));
    }

    const { accessToken, refreshToken: newRefreshToken, user } = result.data;

    const csrfToken = setAuthCookies(req, res, accessToken, newRefreshToken);

    return res.json(successResponse("Tokens refreshed", { user, csrfToken }));
  } catch (error) {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.clearCookie("csrfToken");

    return res.status(401).json({
      code: "REFRESH_FAILED",
      message: "Session expired - please login again",
    });
  }
}

export async function logoutController(req: AuthRequest, res: Response) {
  const userId = req.user?.id;
  if (userId) {
    await redis.del(`refreshToken:${userId}`);
  }

  res.clearCookie("accessToken", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  res.clearCookie("refreshToken", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  res.clearCookie("csrfToken", {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "strict",
  });

  return res.status(200).json(successResponse("Logged out successfully", null));
}

export async function meController(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json(errorResponse("Not authenticated"));
  }
  return res.status(200).json(
    successResponse("User retrieved successfully", {
      id: req.user.id,
      email: req.user.email,
      firstname: req.user.firstname,
      lastname: req.user.lastname,
      currentCompanyId: req.user.currentCompanyId,
    })
  );
}
