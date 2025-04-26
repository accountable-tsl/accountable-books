import jwt from "jsonwebtoken";
import csurf from "csurf";
import { ENV } from "../../config/env";
import { throwError } from "../../shared/utils/response.utils";
import { TokenConfig, TokenExpiration } from "./auth.types";
import { Request, Response } from "express";

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

export const generateAuthTokens = (user: {
  id: string;
  currentCompanyId: string;
}) => {
  const payload = {
    sub: user.id,
    companyId: user.currentCompanyId,
    // Add other minimal claims needed for authorization/permission later
  };

  const accessToken = jwt.sign(payload, JWT_CONFIG.accessToken.secret, {
    expiresIn: TokenExpiration.Access,
  });

  const refreshToken = jwt.sign(
    { sub: user.id },
    JWT_CONFIG.refreshToken.secret,
    {
      expiresIn: TokenExpiration.Refresh,
    }
  );

  return { accessToken, refreshToken };
};

export const csrfProtection = csurf({
  cookie: { httpOnly: true, secure: true, sameSite: "strict" },
});

export const setAuthCookies = (
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string,
  callback: (csrfToken: string) => void
) => {
  csrfProtection(req, res, () => {
    const csrfToken = req.csrfToken();
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
    res.cookie("csrfToken", csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "strict",
    });
    callback(csrfToken);
  });
};
