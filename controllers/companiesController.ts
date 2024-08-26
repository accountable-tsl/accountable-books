import { Request, Response } from "express";
import { createACompany } from "../models/companiesModel";

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

export default { createCompany };
