import { Request, Response } from "express";
import { createACompany, getCompanies, getCompany } from "../models/companiesModel";

const createCompany = async (req: Request, res: Response) => {
  try {
    const result = await createACompany(req.body);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in createCompany:", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const getAllCompanies = async (req: Request, res: Response) => {
  
  try {
    const result = await getCompanies();
    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "No accounts found") {
      res.status(204).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
}

const getSingleCompany = async (req: Request, res: Response) => {
  const companyId = req.company!.id;

  if (!companyId) {
    return res.status(400).json({ message: "Bad Request" });
  }
  
  try {
    const result = await getCompany(companyId);
    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "Company not found") {
      res.status(204).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
}

export { createCompany, getAllCompanies, getSingleCompany };
