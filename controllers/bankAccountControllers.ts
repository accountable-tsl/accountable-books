import { Request, Response } from "express";
import {
  createNewBankAccount,
  getAllBankAccounts,
  getSingleBankAccount,
} from "../models/bankAccountModel";

export async function allBankAccounts(req: Request, res: Response) {
  try {
    const companyId = req.company!.id;

    if (!companyId) {
      return res.status(400).json({ message: "Bad Request" });
    }

    const result = await getAllBankAccounts(companyId);
    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "No bank accounts found") {
      return res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in allBanks:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function singleBankAccount(req: Request, res: Response) {
  try {
    const companyId = req.company!.id;

    if (!companyId) {
      return res.status(400).json({ message: "Bad Request" });
    }

    const bankId = req.params.id;

    if (!bankId) {
      return res.status(400).json({ message: "Bad Request: Invalid Bank ID" });
    }

    const result = await getSingleBankAccount(companyId, bankId);

    if (result.success) {
      res.status(200).json(result);
    } else if (result.message === "Bank account not found") {
      return res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Unexpected error in singleBankAccount:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function createBankAccount(req: Request, res: Response) {
  try {
    const companyId = req.company!.id;
    if (!companyId) {
      return res.status(400).json({ message: "Bad Request" });
    }
    const { bankId, displayName, bankAccountType, bankAccountNo, currencyId } =
      req.body;

    const missingFields: string[] = [];

    if (!bankId) missingFields.push("bankId");
    if (!displayName) missingFields.push("displayName");
    if (!bankAccountType) missingFields.push("bankAccountType");
    if (!bankAccountNo) missingFields.push("bankAccountNo");
    if (!currencyId) missingFields.push("currencyId");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following required fields are missing: ${missingFields.join(
          ", "
        )}`,
      });
    }

    const result = await createNewBankAccount(companyId, {
      bankId: isNaN(parseInt(bankId)) ? bankId : parseInt(bankId),
      displayName,
      bankAccountType,
      bankAccountNo,
      currencyId: isNaN(parseInt(currencyId))
        ? currencyId
        : parseInt(currencyId),
    });

    if (result.success) {
      return res.status(201).json({ result });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || "Failed to create bank account",
      });
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
