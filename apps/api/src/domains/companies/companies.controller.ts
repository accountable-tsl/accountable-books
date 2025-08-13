import { Request, Response } from "express";
import {
  AppError,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { AuthRequest } from "../../features/auth/auth.types";
import {
  getCompanies,
  getSingleCompany,
  switchCompany,
  updateCompany,
} from "./companies.model";
import { setAuthCookies } from "../../features/auth/auth.utils";

export const switchCompanyController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const companyId = req.params.companyId || req.body.companyId;
    if (!req.user || !companyId) throw new AppError("Unauthorized");

    const switchResult = await switchCompany({
      user: req.user,
      newCompanyId: companyId,
    });

    if (!switchResult.success) {
      return res.status(403).json(errorResponse(switchResult.message));
    }

    const { accessToken, refreshToken, user, company } = switchResult.data;

    setAuthCookies(req, res, accessToken, refreshToken);
    return res.json(
      successResponse("Company switched successfully", {
        user,
        company,
      })
    );
  } catch (error) {
    res.status(500).json(errorResponse("Something went wrong"));
  }
};

export const getCompaniesController = async (req: Request, res: Response) => {
  try {
    const result = await getCompanies();

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return res
      .status(500)
      .json(errorResponse(error.message || "An unexpected error occurred"));
  }
};
export const getCompanyController = async (req: Request, res: Response) => {
  try {
    const company = req.company;

    if (!company || !company.id) {
      return res.status(400).json(errorResponse("Bad Request"));
    }

    return res
      .status(200)
      .json(successResponse("Company retrieved successfully", company));
  } catch (error) {
    return res.status(500).json(errorResponse());
  }
};

export const updateCompanyController = async (
  req: AuthRequest,
  res: Response
) => {
  const companyId = req.params.companyId;
  const userId = req.user?.id;
  const data = req.body;
  const {
    companyId: companyIdFromData,
    userId: userIdFromData,
    ...updateData
  } = data;

  if (!companyId || !userId) {
    return res.status(400).json(errorResponse("Bad Request"));
  }

  try {
    const result = await updateCompany(companyId, updateData, userId);
    if (!result.success) {
      const { error, ...rest } = result;
      return res.status(404).json(rest);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json(errorResponse("Something went wrong"));
  }
};
