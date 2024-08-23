import express from "express";
import { Request, Response } from "express";
import {
  checkAccCode,
  checkAccName,
  createCOAModel,
  getAllAccountTypes,
} from "../models/coaModel";

const getAccountTypes = async (req: Request, res: Response) => {
  try {
    const result = await getAllAccountTypes();
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in getAccountTypes:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
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
    if (result.accountCodeExists) {
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

const createManyCOA = async (req: Request, res: Response) => {};

export {
  checkAccountCode,
  checkAccountName,
  createCOA,
  createManyCOA,
  getAccountTypes,
};
