import Decimal from "decimal.js";
import { TransactionsStat } from "@/features/bankConnection/manualUpload/types";
import { findDateRange } from "@/shared/utils/formatting-utils";

export const computeStats = ({
  transactions,
  amountField = "amount",
  dateField = "date",
}: {
  transactions: Record<string, unknown>[];
  amountField?: "amount" | string;
  dateField?: "date" | string;
}): TransactionsStat => {
  let totalPositive = new Decimal(0);
  let totalNegative = new Decimal(0);
  let netChange = new Decimal(0);
  let dateRange: { earliestDate: Date | null; latestDate: Date | null } = {
    earliestDate: null,
    latestDate: null,
  };

  if (dateField) {
    dateRange = findDateRange(transactions, dateField);
  }

  for (const row of transactions) {
    let val = row[amountField];
    if (val == null || val === "") continue;

    let decimal: Decimal;

    try {
      if (typeof val === "string") {
        // Remove commas, dollar signs, and other common currency formatting
        const cleanedVal = val.replace(/[$,\s]/g, "");
        decimal = new Decimal(cleanedVal);
      } else {
        decimal = new Decimal(val as string | number);
      }
    } catch (error) {
      // Skip invalid values that can't be converted to Decimal
      console.log("Invalid value for amount:", val, error);
      continue;
    }

    if (decimal.gt(0)) {
      totalPositive = totalPositive.plus(decimal);
    } else if (decimal.lt(0)) {
      totalNegative = totalNegative.plus(decimal);
    }

    netChange = netChange.plus(decimal);
  }

  return {
    totalPositive: totalPositive.toNumber(),
    totalNegative: totalNegative.toNumber(),
    netChange: netChange.toNumber(),
    transactionCount: transactions.length,
    ...dateRange,
  };
};
