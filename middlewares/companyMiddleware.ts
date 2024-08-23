import { Company, PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
const prisma = new PrismaClient();

export const checkCompanyId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let companyId = req.body.companyId || req.query.companyId;

  if (req.body.companyId) {
    companyId = parseInt(req.body.companyId, 10);
  } else if ((req.query.companyId, 10)) {
    companyId = parseInt(req.query.companyId as string, 10);
  }
  if (!companyId || companyId < 0 || isNaN(companyId)) {
    return res.status(400).json({ message: "Access Denied" });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ message: "Access Denied" });
    }

    req.company = company;

    next();
  } catch (error: any) {
    console.error("Error validating company:", { message: error.message });
    res.status(500).json({ message: "Server error." });
  }
};
