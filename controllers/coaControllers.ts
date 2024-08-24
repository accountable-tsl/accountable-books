import express from "express";
import { Request, Response } from "express";
import {
  checkAccCode,
  checkAccName,
  createBulkCOAModel,
  createCOAModel,
  getAllAccountTypes,
  getAllCOA,
} from "../models/coaModel";

const getAccountTypes = async (req: Request, res: Response) => {
  try {
    const result = await getAllAccountTypes();
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in getAccountTypes:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getCOA = async (req: Request, res: Response) => {
  const companyId = req.company!.id;

  if (!req.company || !req.company.id) {
    return res.status(400).json({ message: "Bad Request" });
  }

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  const sortBy = (req.query.sortBy as string) || "accountCode";
  const sortOrder = (req.query.sortOrder as "asc" | "desc") || "asc";

  try {
    const result = await getAllCOA(companyId, page, limit, sortBy, sortOrder);
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
};

const checkAccountCode = async (req: Request, res: Response) => {
  const accountCode = req.body.accountCode || (req.query.accountCode as string);
  const companyId = req.company!.id;

  if (!companyId || typeof accountCode !== "string") {
    return res.status(400).json({ message: "Bad Request" });
  }

  if (accountCode.length > 20) {
    return res
      .status(400)
      .json({ message: "Account code length exceeds limit" });
  }

  try {
    const result = await checkAccCode(companyId, accountCode);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
};

const checkAccountName = async (req: Request, res: Response) => {
  const accountName = req.body.accountName || (req.query.accountName as string);
  const companyId = req.company!.id;

  if (!companyId || typeof accountName !== "string") {
    return res.status(400).json({ message: "Bad Request" });
  }

  if (accountName.length > 40) {
    return res
      .status(400)
      .json({ message: "Account name length exceeds limit" });
  }

  try {
    const result = await checkAccName(companyId, accountName);
    if (result.accountNameExists) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
};

const createCOA = async (req: Request, res: Response) => {
  const data = req.body;
  const companyId = req.company!.id;

  if (!companyId || !data) {
    return res.status(400).json({ message: "Bad Request" });
  }

  if (!data.accountName) {
    return res.status(400).json({ message: "Account Name Required" });
  }

  if (!data.accountTypeId && !data.accountTypeName) {
    return res
      .status(400)
      .json({ message: "Missing required fields - Account Type" });
  }

  try {
    const result = await createCOAModel(Number(companyId), data);

    if (!result || result.success === false) {
      res.status(400).json(result);
    } else {
      res.status(200).json(result);
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
};

const createBulkCOA = async (req: Request, res: Response) => {
  const data = req.body;
  const companyId = req.company!.id;

  if (!companyId || !data) {
    return res.status(400).json({ success: false, message: "Bad Request" });
  }

  try {
    const result = await createBulkCOAModel(Number(companyId), data);

    if (!result || result.success === false) {
      res.status(400).json(result);
    } else {
      res.status(200).json(result);
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
};

export {
  getAccountTypes,
  getCOA,
  checkAccountCode,
  checkAccountName,
  createCOA,
  createBulkCOA,
};
