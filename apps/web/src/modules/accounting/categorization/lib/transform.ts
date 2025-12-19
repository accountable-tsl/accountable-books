import { format } from 'date-fns-tz';

import type {
  CategorizationTransaction,
  CategorizationTransactionStatus,
  GroupedTransaction,
  GroupedTransactionOld,
  TransactionSummary,
} from '../model/types';

export function groupCategorizationTransactions(
  raw: CategorizationTransaction[],
  exchangeRateOverrides?: Map<string, number>,
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

  const statusOrder: Record<CategorizationTransactionStatus, number> = {
    uncategorized: 0,
    proposed: 1,
    posted: 2,
  };

  // Convert to output format
  const result: GroupedTransaction[] = [];

  for (const [id, txns] of groupedMap.entries()) {
    const hasMultipleEntries = txns.length > 1;
    const entryCount = txns.length;
    const firstLine = txns[0];

    // Check if we have an exchange rate override for this transaction
    const overrideRate = exchangeRateOverrides?.get(id);
    const effectiveExchangeRate =
      overrideRate ?? firstLine.custom_exchange_rate;

    // Recalculate reporting_amount if we have an override
    const txnsWithRecalculatedAmounts = txns.map((txn) => {
      if (overrideRate !== undefined) {
        return {
          ...txn,
          reporting_amount: txn.native_amount * overrideRate,
          custom_exchange_rate: overrideRate,
        };
      }
      return txn;
    });

    // Helper to get value or multiple indicator
    const getFieldOrMultiple = <T>(
      getValue: (t: CategorizationTransaction) => T,
      multipleText: string,
    ): T | string | null => {
      if (!hasMultipleEntries) return getValue(firstLine);
      const values = txns.map(getValue);
      return allTheSame(values) ? values[0] : multipleText;
    };

    result.push({
      hasMultipleEntries,
      entryCount,
      rowType: 'parent',

      id,
      bankTransactionId: id,
      bankName: firstLine.bank_display_name,
      bankLogo: firstLine.bank_logo,
      bankAccountName: firstLine.bank_account_display_name,
      bankAccountCurrencyCode: firstLine.bank_currency_code,
      date: format(new Date(firstLine.date), 'dd MMM yyyy'),

      fsDate:
        getFieldOrMultiple(
          (t) => format(new Date(t.fs_date), 'dd MMM yyyy'),
          '',
        ) || null,

      description: getFieldOrMultiple(
        (t) => t.description,
        'Transaction has multiple entries',
      ),

      contactId: getFieldOrMultiple((t) => t.contact_id, 'Multiple contacts'),
      contactName: getFieldOrMultiple(
        (t) => t.contact_name,
        'Multiple contacts',
      ),

      reference: getFieldOrMultiple((t) => t.reference, 'Multiple references'),

      projectId: getFieldOrMultiple((t) => t.project_id, 'Multiple projects'),
      projectName: getFieldOrMultiple(
        (t) => t.project_name,
        'Multiple projects',
      ),

      nativeAmount: txnsWithRecalculatedAmounts.reduce(
        (sum, txn) => sum + txn.native_amount,
        0,
      ),

      reportingAmount: txnsWithRecalculatedAmounts.reduce(
        (sum, txn) => sum + txn.reporting_amount,
        0,
      ),

      exchangeRate: effectiveExchangeRate.toFixed(4),

      spent: txnsWithRecalculatedAmounts.reduce((sum, txn) => {
        return txn.reporting_amount < 0
          ? sum + Math.abs(txn.reporting_amount)
          : sum;
      }, 0),

      received: txnsWithRecalculatedAmounts.reduce((sum, txn) => {
        return txn.reporting_amount > 0 ? sum + txn.reporting_amount : sum;
      }, 0),

      // Average confidence (nulls treated as 0)
      confidence:
        txns.reduce((sum, txn) => sum + (txn.confidence ?? 0), 0) / txns.length,

      // Lowest status (for workflow purposes)
      status:
        txns.length === 0
          ? 'uncategorized'
          : txns.reduce((lowest, txn) =>
              statusOrder[txn.categorization_status] <
              statusOrder[lowest.categorization_status]
                ? txn
                : lowest,
            ).categorization_status,

      coaId: hasMultipleEntries ? null : firstLine.coa_id,
      coaName: hasMultipleEntries ? null : firstLine.coa_name,
      coaCode: hasMultipleEntries ? null : firstLine.coa_code,

      entries: txnsWithRecalculatedAmounts.map((txn) => ({
        id: txn.id,
        bankTransactionId: txn.id,
        bankName: txn.bank_display_name,
        bankLogo: txn.bank_logo,
        bankAccountName: txn.bank_account_display_name,
        bankAccountCurrencyCode: txn.bank_currency_code,
        date: format(new Date(txn.date), 'dd MMM yyyy'),
        fsDate: format(new Date(txn.fs_date), 'dd MMM yyyy'),
        description: txn.description,
        contactName: txn.contact_name,
        contactId: txn.contact_id,
        reference: txn.reference,
        projectId: txn.project_id,
        projectName: txn.project_name,
        nativeAmount: txn.native_amount,
        reportingAmount: txn.reporting_amount,
        exchangeRate: txn.custom_exchange_rate.toFixed(4),
        spent: txn.reporting_amount < 0 ? Math.abs(txn.reporting_amount) : 0,
        received: txn.reporting_amount > 0 ? txn.reporting_amount : 0,
        confidence: txn.confidence,
        status: txn.categorization_status,
        coaId: txn.coa_id,
        coaName: txn.coa_name,
        coaCode: txn.coa_code,
        rowType: 'subRow',
      })),
    });
  }

  result.sort((a, b) => {
    // 1. bank_display_name (asc)
    if (a.bankName !== b.bankName) {
      return a.bankName.localeCompare(b.bankName);
    }

    // 2. bank_account_id (asc) - using bankAccountName as proxy
    if (a.bankAccountName !== b.bankAccountName) {
      return a.bankAccountName.localeCompare(b.bankAccountName);
    }

    // 3. date (desc) - parse the formatted date string back to compare
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) {
      return dateB - dateA; // desc
    }

    // 4. coa_name ASC NULLS LAST
    const coaA = a.coaName || '';
    const coaB = b.coaName || '';
    if (coaA !== coaB) {
      if (!a.coaName) return 1;
      if (!b.coaName) return -1;
      return coaA.localeCompare(coaB);
    }

    // 5. contact_name ASC NULLS LAST
    const contactA = a.contactName || '';
    const contactB = b.contactName || '';
    if (contactA !== contactB) {
      if (!a.contactName) return 1;
      if (!b.contactName) return -1;
      return contactA.localeCompare(contactB);
    }

    // 6. confidence DESC NULLS LAST
    const confA = a.confidence ?? -1;
    const confB = b.confidence ?? -1;
    if (confA !== confB) {
      if (confA === null || confA === undefined) return 1;
      if (confB === null || confB === undefined) return -1;
      return confB - confA; // desc
    }

    // // Multiple entries together...
    // const multipleA = (a.entries && a.entries.length > 1) ?? false;
    // const multipleB = (b.entries && b.entries.length > 1) ?? false;

    // 7. id (final tie-breaker)
    return a.id.localeCompare(b.id);
  });

  return result;
}

const allTheSame = (arr: any[]): boolean => {
  if (arr.length === 0) return true;
  return arr.every((v) => v === arr[0]);
};

/**
 * Groups transactions by bank_transaction_id
 * Calculates summary information for each group
 */
export function groupTransactionsByBankTxnId(
  raw: CategorizationTransaction[],
): GroupedTransactionOld[] {
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
  const grouped: GroupedTransactionOld[] = [];

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
