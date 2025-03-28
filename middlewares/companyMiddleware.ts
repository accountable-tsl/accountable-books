import { PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
import { getIdentifierType } from "../utils/utils";
const prisma = new PrismaClient();

export const checkCompanyId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const companyId =
    req.params.companyId || req.body.companyId || req.query.companyId;

  if (!companyId || typeof companyId !== "string" || companyId.length > 40) {
    return res.status(400).json({ message: "Invalid Company Identifier" });
  }

  const identifierType = getIdentifierType(companyId);
  const isUUID = identifierType === "uuid";
  // const isUUID =
  //   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
  //     companyId
  //   );

  try {
    const company = await prisma.company.findUnique({
      where: isUUID ? { id: companyId } : { shortCode: companyId },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    req.company = { ...company, id: companyId };

    next();
  } catch (error: any) {
    console.error("Error validating company:", { message: error.message });
    res.status(500).json({ message: "Server error." });
  }
};
