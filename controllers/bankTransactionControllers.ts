import { Request, Response } from "express";
import { postBankTransactions } from "../models/bankTransactionModel";

export async function handleTransactionImport(req: Request, res: Response) {
  //Validate Company ID or return
  //Validate BankID or Return
  //Check that a valid "source" is included in the data sent
  //Check that there are transactions in the data sent from frontend
  //Run postBankTransaction function from bankTrasactionModel.ts

  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const bankAccountId = req.params.bankAccountId || req.body.bankAccountId;

    const missingFields: string[] = [];

    if (!bankAccountId) missingFields.push("bankAccountId");
    if (!req.body.startDate) missingFields.push("startDate");
    if (!req.body.endDate) missingFields.push("endDate");
    if (!req.body.bankTransactions) {
      missingFields.push("bankTransactions");
    } else if (!Array.isArray(req.body.bankTransactions)) {
      missingFields.push("bankTransactions must be an array");
    } else if (
      !req.body.bankTransactions.every(
        (tx: unknown) => typeof tx === "object" && tx !== null
      )
    ) {
      missingFields.push("bankTransactions must be an array of objects");
    }
    if (!req.body.createdBy) missingFields.push("createdBy");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following required fields are missing: ${missingFields.join(
          ", "
        )}`,
      });
    }

    const data = {
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      source: req.body.source || "FILE_IMPORT",
      bankAccountId: bankAccountId,
      bankTransactions: req.body.bankTransactions,
      createdBy: req.body.createdBy,
    };

    const result = await postBankTransactions(companyId, data);

    if (result.success) {
      return res.status(201).json({ result });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || "Failed to post bank transactions",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
