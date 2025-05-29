import { ENV } from "../../config/env";
import { throwError } from "../../shared/utils/response.utils";
import { TokenConfig, TokenExpiration } from "./auth.types";

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
