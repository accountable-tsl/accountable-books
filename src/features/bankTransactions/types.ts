import Decimal from "decimal.js";
import { BankAccountWithMeta } from "@/features/bankAccount/types";

export type TransactionsStat = {
  totalPositive: number | Decimal;
  totalNegative: number | Decimal;
  netChange: number | Decimal;
  transactionCount: number;
  earliestDate: Date | null;
  latestDate: Date | null;
};
export type FileTransaction = {
  fileName: string;
  transactions: Record<string, unknown>[];
  stats: TransactionsStat;
  bankAccount: BankAccountWithMeta;
};
