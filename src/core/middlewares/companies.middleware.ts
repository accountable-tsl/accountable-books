import { Request, Response, NextFunction } from "express";
import { getIdentifierType } from "../../utils/utils-old";
import { getCompanyUUID } from "../../shared/utils/random.utils";
import knex from "knex";
import { errorResponse } from "../../shared/utils/response.utils";

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

  const companyUUID = getCompanyUUID(companyId);

  try {
    const company = await knex("companies").where("id", companyUUID).first();

    if (!company) {
      return res.status(404).json(errorResponse("Company not found"));
    }

    req.company = { ...company, id: company.id };

    next();
  } catch (error: any) {
    res
      .status(500)
      .json(errorResponse("Error validating company", error.message));
  }
};
