import { Request, Response } from "express";
import { loginService, refreshTokenService } from "./auth.service";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { AuthRequest } from "./auth.types";
import { setAuthCookies } from "./auth.utils";

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    const login = await loginService(email, password);
    console.log(login);
    if (!login.success) {
      return res.status(403).json(errorResponse(login.message));
    }

    const { accessToken, refreshToken, user, currentCompanyId } = login.data;

    const csrfToken = setAuthCookies(req, res, accessToken, refreshToken);

    return res.json(
      successResponse("User logged in successfully", {
        user,
        csrfToken,
        currentCompanyId,
      })
    );
  } catch (error) {
    return res.status(500).json(errorResponse("Something went wrong"));
  }
}

export async function refreshTokenController(req: AuthRequest, res: Response) {
  try {
    const refreshToken = req.cookies.refreshToken;
    const userId = req.user?.id;
    const currentCompanyId =
      req.user?.currentCompanyId || req.body.currentCompanyId;

    if (!userId || !currentCompanyId) {
      return res
        .status(400)
        .json(errorResponse("User ID or company ID missing"));
    }

    const refreshResult = await refreshTokenService(
      refreshToken,
      userId,
      currentCompanyId
    );
    if (!refreshResult.success) {
      return res.status(403).json(errorResponse(refreshResult.message));
    }

    const {
      accessToken,
      refreshToken: newRefreshToken,
      user,
    } = refreshResult.data;

    const csrfToken = setAuthCookies(req, res, accessToken, newRefreshToken);
    return res.json(successResponse("Tokens refreshed", { user, csrfToken }));
  } catch (error) {
    return res.status(500).json(errorResponse("Something went wrong"));
  }
}
