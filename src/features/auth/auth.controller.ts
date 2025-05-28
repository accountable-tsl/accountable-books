import { Request, Response } from "express";
import {
  loginService,
  refreshTokenService,
  resendVerificationEmailService,
  verifyEmailService,
} from "./auth.service";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { AuthRequest } from "./auth.types";
import { setAuthCookies } from "./auth.utils";
import { redis } from "../../lib/redis";
import { user } from "../../domains/users/users.types";
import { ENV, isProd } from "../../config/env";
import { getAppUrl } from "../../shared/utils/string.utils";

export async function loginController(req: Request, res: Response) {
  const baseDomain = ENV.BASE_DOMAIN || "lvh.me";
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
        redirectTo: `https://${data.user.assignedFirmSlug}.${baseDomain}/${data.user.currentCompanyId}/dashboard`,
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
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await redis.srem(`refreshTokens:${userId}`, refreshToken);
    }
  }

  const cookieDomain = ENV.COOKIE_DOMAIN;
  res.clearCookie("accessToken", {
    domain: cookieDomain,
    path: "/",
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
  });
  res.clearCookie("refreshToken", {
    domain: cookieDomain,
    path: "/",
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
  });
  res.clearCookie("csrfToken", {
    domain: cookieDomain,
    path: "/",
    httpOnly: false,
    secure: isProd,
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

export async function verifyEmailController(req: Request, res: Response) {
  const { token, email, slug } = req.query;

  const appUrl = getAppUrl(String(slug));

  if (!token || !email) {
    return res.redirect(`${appUrl}/email-verified?status=failed`);
  }

  try {
    const result = await verifyEmailService({
      token: String(token),
      email: String(email),
    });

    return res.redirect(
      `${appUrl}/email-verified?status=${result?.success ? "success" : "failed"}&email=${encodeURIComponent(String(email))}`
    );
  } catch (error) {
    return res.redirect(
      `${appUrl}/email-verified?status=failed&email=${encodeURIComponent(String(email))}`
    );
  }
}

export async function resendVerEmailController(
  req: AuthRequest,
  res: Response
) {
  const email = req.body.email || req.query.email || req.user?.email;
  const userId = req.body.userId || req.user?.id;
  const slug = req.user?.assignedFirmSlug || req.company?.assignedFirmSlug;

  if (!email || !userId) {
    return res.status(400).json(errorResponse("User email or id is required"));
  }

  if (email && typeof email !== "string") {
    return res.status(400).json(errorResponse("Invalid email format"));
  }

  try {
    const result = await resendVerificationEmailService({
      email: email.trim(),
      slug: slug?.trim(),
      userId: userId?.toString(),
    });

    if (!result.success) {
      const status = result.message === "User not found" ? 404 : 400;
      return res.status(status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Something went wrong"));
  }
}
