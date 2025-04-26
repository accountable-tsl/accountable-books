import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "./auth.utils";
import { TokenExpiration } from "./auth.types";

export const generateTokens = (user: { id: string }) => {
  const payload = {
    sub: user.id,
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
