import { Company, PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
const prisma = new PrismaClient();

export const checkCompanyId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const companyId = parseInt(req.body.companyId, 10);
    if (!companyId || companyId < 0 || isNaN(companyId)) {
      return res.status(400).json({ message: "Valid Company ID is required" });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    (req as any).company = company;

    next();
  } catch (error: any) {
    console.error("Error validating company:", { message: error.message });
    res.status(500).json({ message: "Server error." });
  }
};
