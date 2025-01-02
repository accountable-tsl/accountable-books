import { Decimal } from "@prisma/client/runtime/library";
import { Request, Response } from "express";
import { getMergedTransactions } from "../models/transactionModel";

export async function fetchTransactions(req: Request, res: Response) {
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

    const response = await getMergedTransactions(companyId, filter);

    if (response.success) {
      return res.status(200).json({
        success: response.success,
        message: response.message,
        data: response.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.message || "Failed to retrieve transactions",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

export async function createAccountTransactionsFromBank(
  req: Request,
  res: Response
) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }
  } catch (error) {}
}
