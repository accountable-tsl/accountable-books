import { Request, Response, NextFunction } from "express";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import { errorResponse } from "../../shared/utils/response.utils";
import knex from "../../../knexClient";
import { getSingleCompany } from "../../domains/companies/companies.model";

export const checkCompanyId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let companyId: string;
  companyId = req.params.companyId || req.body.companyId || req.query.companyId;

  if (!companyId || typeof companyId !== "string" || companyId.length > 40) {
    return res.status(400).json({ message: "Invalid Company Identifier" });
  }

  try {
    const company = await getSingleCompany(companyId);

    if (!company) {
      return res.status(404).json(errorResponse("Company not found"));
    }

    req.company = { ...company.data, id: company.data?.id };

    next();
  } catch (error: any) {
    res
      .status(500)
      .json(errorResponse("Error validating company", error.message));
  }
};
