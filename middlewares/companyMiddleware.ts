import { Company, PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
const prisma = new PrismaClient();

export const checkCompanyId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const companyId =
    req.params.companyId || req.body.companyId || req.query.companyId;

  if (!companyId || companyId.length > 40) {
    return res.status(400).json({ message: "Invalid Company ID" });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    req.company = company;

    next();
  } catch (error: any) {
    console.error("Error validating company:", { message: error.message });
    res.status(500).json({ message: "Server error." });
  }
};
