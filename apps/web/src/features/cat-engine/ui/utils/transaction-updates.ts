import type { GroupedTransaction } from '@/modules/accounting/categorization';

/**
 * Updates a transaction's amounts and entries based on a new exchange rate.
 * Handles both single-entry and multi-entry transactions.
 */
export function updateTransactionExchangeRate(
  txn: GroupedTransaction,
  newRate: number,
): GroupedTransaction {
  const exchangeRateStr = newRate.toFixed(4);
  // For single entry transactions, update the transaction itself
  if (!txn.hasMultipleEntries) {
    const newReportingAmount = txn.nativeAmount * newRate;
    return {
      ...txn,
      exchangeRate: exchangeRateStr,
      reportingAmount: newReportingAmount,
      spent: newReportingAmount > 0 ? newReportingAmount : 0,
      received: newReportingAmount < 0 ? Math.abs(newReportingAmount) : 0,
    };
  }
  // For multiple entries, update each entry
  const updatedEntries = (txn.entries || []).map((entry) => {
    const newReportingAmount = entry.nativeAmount * newRate;
    return {
      ...entry,
      reportingAmount: newReportingAmount,
      exchangeRate: exchangeRateStr,
      spent: newReportingAmount > 0 ? newReportingAmount : 0,
      received: newReportingAmount < 0 ? Math.abs(newReportingAmount) : 0,
    };
  });
  // Recalculate totals from entries
  const newSpent = updatedEntries.reduce(
    (sum, entry) =>
      sum + (entry.reportingAmount > 0 ? entry.reportingAmount : 0),
    0,
  );
  const newReceived = updatedEntries.reduce(
    (sum, entry) =>
      sum + (entry.reportingAmount < 0 ? Math.abs(entry.reportingAmount) : 0),
    0,
  );
  return {
    ...txn,
    exchangeRate: exchangeRateStr,
    reportingAmount: updatedEntries.reduce(
      (sum, e) => sum + e.reportingAmount,
      0,
    ),
    spent: newSpent,
    received: newReceived,
    entries: updatedEntries,
  };
}
