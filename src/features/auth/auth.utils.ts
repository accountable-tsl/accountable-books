import jwt from "jsonwebtoken";
import csurf from "csurf";
import { ENV, isProduction } from "../../config/env";
import { throwError } from "../../shared/utils/response.utils";
import { DecodedToken, TokenConfig, TokenExpiration } from "./auth.types";
import { Request, Response } from "express";
import { generateRandomToken } from "../../shared/utils/crypto.utils";

if (!ENV.JWT_ACCESS_SECRET || !ENV.JWT_REFRESH_SECRET) {
  throwError("JWT secrets must be defined in .env");
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
  try {
    if (
      !payload.sub ||
      !JWT_CONFIG.accessToken.secret ||
      !JWT_CONFIG.refreshToken.secret
    ) {
      throw new Error("Invalid payload or missing JWT secrets");
    }

    const accessToken = jwt.sign(payload, JWT_CONFIG.accessToken.secret, {
      expiresIn: TokenExpiration.Access,
    });

    const refreshToken = jwt.sign(payload, JWT_CONFIG.refreshToken.secret, {
      expiresIn: TokenExpiration.Refresh,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw error;
  }
};

export const csrfProtection = csurf({
  cookie: {
    key: "csrfToken",
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
  },
});

export const setAuthCookies = (
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string
) => {
  const csrfToken = req.csrfToken ? req.csrfToken() : generateRandomToken();

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.cookie("csrfToken", csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
  });

  return csrfToken;
};
