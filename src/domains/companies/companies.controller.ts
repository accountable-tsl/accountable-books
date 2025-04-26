import { Request, Response } from "express";
import {
  ensure,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { AuthRequest } from "../../features/auth/auth.types";
import { switchCompany } from "./companies.model";
import { setAuthCookies } from "../../features/auth/auth.utils";

export const switchCompanyController = async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.company.id;
    ensure(req.user, "Unauthorized");

    const switchResult = await switchCompany(req.user.id, companyId);

    if (!switchResult.success) {
      return res.status(403).json(errorResponse(switchResult.message));
    }

    const { accessToken, refreshToken, user } = switchResult.data;

    setAuthCookies(req, res, accessToken, refreshToken, (csrfToken) => {
      res.json(
        successResponse("Company switched successfully", { user, csrfToken })
      );
    });
  } catch (error) {
    res.status(500).json(errorResponse("Something went wrong"));
  }
};
