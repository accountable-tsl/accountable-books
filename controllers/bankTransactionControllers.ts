import { Request, Response } from "express";
import { postBankTransactions } from "../models/bankTransactionModel";

export interface BankTransaction {
  date: Date | string;
  description?: string;
  amount: number;
  payee?: string;
  reference?: string;
  type?: string;
}

function validateBankTransactions(transactions: any[]): string[] {
  const errors: string[] = [];
  transactions.forEach((tx: any, index: number) => {
    if (!tx.date || !tx.amount) {
      errors.push(
        `bankTransactions[${index}] is missing ${
          !tx.date && !tx.amount
            ? "date and amount"
            : !tx.date
              ? "date"
              : "amount"
        }`
      );
    }
  });
  return errors;
}

function validateRequestBody(req: Request): string[] {
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
    const transactionErrors = validateBankTransactions(
      req.body.bankTransactions
    );
    missingFields.push(...transactionErrors);
  }
  if (!req.body.createdById) missingFields.push("createdById");

  return missingFields;
}

function mapTransactions(transactions: any[]): BankTransaction[] {
  return transactions.map((transaction: any) => ({
    date: new Date(transaction.date),
    description: transaction.description || "",
    amount: parseFloat(transaction.amount),
    payee: transaction.payee,
    reference: transaction.reference,
    type:
      transaction.type ||
      (parseFloat(transaction.amount) < 0 ? "Debit" : "Credit"),
  }));
}

export async function handleTransactionImport(req: Request, res: Response) {
  try {
    const companyId = req.company!.id || req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Bad Request" });
    }

    const missingFields = validateRequestBody(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following required fields are missing: ${missingFields.join(
          ", "
        )}`,
      });
    }

    const transactions = mapTransactions(req.body.bankTransactions).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const data = {
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      source: req.body.source || "FILE_IMPORT",
      bankAccountId: req.body.bankAccountId,
      bankTransactions: transactions,
      createdById: req.body.createdById,
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
