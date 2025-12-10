import type {
  CategorizationTransaction,
  GroupedTransaction,
  TransactionSummary,
} from '../model/types';

/**
 * Groups transactions by bank_transaction_id
 * Calculates summary information for each group
 */
export function groupTransactionsByBankTxnId(
  raw: CategorizationTransaction[],
): GroupedTransaction[] {
  if (raw.length === 0) {
    return [];
  }

  // Group by id (bank_transaction_id)
  const groupedMap = new Map<string, CategorizationTransaction[]>();

  for (const txn of raw) {
    const existing = groupedMap.get(txn.id);
    if (existing) {
      existing.push(txn);
    } else {
      groupedMap.set(txn.id, [txn]);
    }
  }

  // Transform to GroupedTransaction array
  const grouped: GroupedTransaction[] = [];

  for (const [id, lines] of groupedMap.entries()) {
    const firstLine = lines[0];

    // Calculate summary
    const summary = calculateSummary(lines);

    grouped.push({
      id,
      lines,
      summary,
      status: firstLine.categorization_status,
      date: firstLine.date,
      fs_date: firstLine.fs_date,
      bank_amount: firstLine.bank_amount,
      bank_account_id: firstLine.bank_account_id,
      bank_account_display_name: firstLine.bank_account_display_name,
      bank_currency_id: firstLine.bank_currency_id,
      bank_currency_code: firstLine.bank_currency_code,
      bank_id: firstLine.bank_id,
      bank_display_name: firstLine.bank_display_name,
      bank_logo: firstLine.bank_logo,
      is_editable: firstLine.is_editable,
    });
  }

  return grouped;
}

/**
 * Calculates summary information for a group of transaction lines
 */
function calculateSummary(
  lines: CategorizationTransaction[],
): TransactionSummary {
  const splitCount = lines.length;
  const isSplit = splitCount > 1;

  // Sum all amounts
  const totalReportingAmount = lines.reduce(
    (sum, line) => sum + line.reporting_amount,
    0,
  );
  const totalNativeAmount = lines.reduce(
    (sum, line) => sum + line.native_amount,
    0,
  );

  // Get primary account (first line's account, or null if split)
  const primaryLine = lines[0];
  const primaryAccountName = isSplit ? null : (primaryLine.coa_name ?? null);
  const primaryAccountCode = isSplit ? null : (primaryLine.coa_code ?? null);

  return {
    totalReportingAmount,
    totalNativeAmount,
    primaryAccountName,
    primaryAccountCode,
    splitCount,
    isSplit,
  };
}
