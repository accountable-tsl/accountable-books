import { Request, Response } from "express";
import {
  BankTransactionFilters,
  getBankTransactions,
  postBankTransactions,
} from "../models/bankTransactionModel";
import { Decimal } from "@prisma/client/runtime/library";

export async function handleTransactionImport(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const missingFields: string[] = [];
    const bankAccountId = req.body.bankAccountId || req.params.bankAccountId;

    if (!bankAccountId) missingFields.push("bankAccountId");
    if (!req.body.startDate) missingFields.push("startDate");
    if (!req.body.endDate) missingFields.push("endDate");
    if (!req.body.bankTransactions) {
      missingFields.push("bankTransactions");
    } else if (!Array.isArray(req.body.bankTransactions)) {
      missingFields.push("bankTransactions must be an array");
    } else {
      req.body.bankTransactions.forEach((tx: any, index: number) => {
        if (!tx.date || !tx.amount) {
          missingFields.push(
            `bankTransactions[${index}] is missing ${
              !tx.date && !tx.amount
                ? "date and amount"
                : !tx.date
                  ? "date"
                  : "amount"
            }`
          );
        }

        if (tx.amount && isNaN(Number(tx.amount))) {
          missingFields.push(
            `bankTransactions[${index}].amount must be a valid number`
          );
        }
      });
    }
    if (!req.body.createdById) missingFields.push("createdById");

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
      bankAccountId: req.body.bankAccountId,
      bankTransactions: req.body.bankTransactions,
      createdById: req.body.createdById,
    };

    const response = await postBankTransactions(companyId, data);
    if (response.success) {
      return res.status(201).json({ response });
    } else {
      return res.status(400).json({
        success: false,
        message: response.message || "Failed to post bank transactions",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function retrieveBankTransactions(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const filters = req.query;

    const startDate = filters.startDate
      ? new Date(filters.startDate as string)
      : null;
    const endDate = filters.endDate
      ? new Date(filters.endDate as string)
      : null;
    const minAmount = filters.minAmount
      ? new Decimal(filters.minAmount as string)
      : null;
    const maxAmount = filters.maxAmount
      ? new Decimal(filters.maxAmount as string)
      : null;
    const page = filters.page ? parseInt(filters.page as string) : null;
    const pageSize = filters.page ? parseInt(filters.pageSize as string) : null;

    const errors = [];
    if (filters.startDate && !startDate) errors.push("startDate: Check format");
    if (filters.endDate && !endDate) errors.push("endDate: Check format");
    if (filters.minAmount && !minAmount) errors.push("minAmount: Check format");
    if (filters.maxAmount && !maxAmount) errors.push("maxAmount: Check format");

    const filter = {
      ...filters,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(minAmount && { minAmount }),
      ...(maxAmount && { maxAmount }),
      ...(page && { page }),
      ...(pageSize && { pageSize }),
    };

    const response = await getBankTransactions(
      companyId,
      filter as BankTransactionFilters
    );

    if (response.success) {
      return res
        .status(200)
        .json({
          success: response.success,
          message: response.message,
          data: response.data,
        });
    } else {
      return res.status(400).json({
        success: false,
        message: response.message || "Failed to retrieve bank transactions",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
