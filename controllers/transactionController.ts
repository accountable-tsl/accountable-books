import { Decimal } from "@prisma/client/runtime/library";
import { Request, Response } from "express";
import {
  CatEngineTransaction,
  createLedgerEntries,
  getMergedTransactions,
  updateLedgerEntries,
} from "../models/transactionModel";
import { CategorisationStatus } from "@prisma/client";

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
    const categorisationStatus = filters.categorisationStatus
      ? filters.categorisationStatus
      : null;
    const page = filters.currentPage
      ? parseInt(filters.currentPage as string)
      : null;
    const pageSize = filters.pageSize
      ? parseInt(filters.pageSize as string)
      : null;

    const errors = [];
    if (filters.startDate && !startDate) errors.push("startDate: Check format");
    if (filters.endDate && !endDate) errors.push("endDate: Check format");
    if (filters.minAmount && !minAmount) errors.push("minAmount: Check format");
    if (filters.maxAmount && !maxAmount) errors.push("maxAmount: Check format");
    if (filters.categorisationStatus && !categorisationStatus)
      errors.push("categorisationStatus: Check format");

    const filter = {
      ...filters,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(minAmount && { minAmount }),
      ...(maxAmount && { maxAmount }),
      ...(page && { page }),
      ...(pageSize && { pageSize }),
      categorisationStatus: (filters.categorisationStatus || [
        CategorisationStatus.AUTO_CATEGORISED,
        CategorisationStatus.UNCATEGORISED,
      ]) as CategorisationStatus[],
    };

    const response = await getMergedTransactions(companyId, filter);

    if (response.success) {
      return res.status(200).json(response);
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

export async function categoriseBankTransaction(req: Request, res: Response) {
  try {
    const companyId = req.company?.id || req.params.companyId;
    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, message: "Bad Request: Missing company ID." });
    }

    const transactions: CatEngineTransaction[] = req.body;

    if (!transactions || transactions.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No transaction provided" });
    }

    const errors = validateTransactions(transactions);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const { bankTx, ledgerTx } = transactions.reduce(
      (
        acc: {
          bankTx: CatEngineTransaction[];
          ledgerTx: CatEngineTransaction[];
        },
        tx: CatEngineTransaction
      ) => {
        if (tx.transactionSource === "bank") {
          acc.bankTx.push({ ...tx, companyId });
        } else {
          acc.ledgerTx.push({ ...tx, companyId });
        }
        return acc;
      },
      { bankTx: [], ledgerTx: [] }
    );

    const newLedgerEntries = await createLedgerEntries(bankTx);
    const updatedLedgerEntries = await updateLedgerEntries(ledgerTx);

    const createdCount =
      newLedgerEntries.data?.ledgerSuccessfullyPosted?.length || 0;
    const updatedCount =
      updatedLedgerEntries.data?.updatedLedgerTransactions?.length || 0;
    const failedCount =
      (newLedgerEntries.data?.ledgerPostingFailed?.length || 0) +
      (updatedLedgerEntries.data?.failedUpdates?.length || 0);

    const hasSuccess = createdCount > 0 || updatedCount > 0;

    // Combine results
    const response = {
      success: hasSuccess,
      message: hasSuccess
        ? "Some or all ledger entries processed successfully."
        : "Failed to process ledger entries.",
      data: {
        count: `created: ${createdCount}, updated: ${updatedCount}, failed: ${failedCount}`,
        created: newLedgerEntries.data?.ledgerSuccessfullyPosted || [],
        updated: updatedLedgerEntries.data?.updatedLedgerTransactions || [],
        failed: [
          ...(newLedgerEntries.data?.ledgerPostingFailed || []),
          ...(updatedLedgerEntries.data?.failedUpdates || []),
        ],
      },
    };

    return res.status(hasSuccess ? 200 : 400).json(response);
  } catch (error) {
    console.error("Error categorising bank transaction:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
    });
  }
}

function validateTransactions(transactions: CatEngineTransaction[]): string[] {
  const errors: string[] = [];
  transactions.forEach((tx, index) => {
    const validation = isValidTransaction(tx);
    if (!validation.valid) {
      const id = tx.id || `at index ${index}`;
      const missing = ["id", "coaId", "date", "transactionSource"]
        .filter((field) => !tx[field as keyof CatEngineTransaction])
        .join(", ");
      errors.push(`Transaction ${id} is missing required fields: ${missing}`);
    }
  });
  return errors;
}

function isValidTransaction(tx: Partial<CatEngineTransaction>): {
  valid: boolean;
  missing: string[];
} {
  const requiredFields: (keyof CatEngineTransaction)[] = [
    "id",
    "coaId",
    "date",
    "transactionSource",
  ];
  const missing = requiredFields.filter((field) => !tx[field]);

  return { valid: missing.length === 0, missing };
}
