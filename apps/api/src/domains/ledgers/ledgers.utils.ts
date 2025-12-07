import type { Knex } from 'knex';

import { AppError, logger, toDate, toYMD } from '../../shared/index.js';
import { getCurrencyById } from '../currencies/currencies.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';
import type { LedgerEntryInput } from './ledgers.types.js';

/**
 * Helper: Validate bank leg amount matches bank transaction native amount
 *
 * Bank transactions store native amounts only. Bank leg source_amount should be
 * in the bank account's native currency and match the bank transaction amount directly.
 */
export function validateBankLegAmount({
  entries,
  bankTransactionAmount: expectedAmount,
}: {
  entries: Array<{
    source_amount: number;
    is_bank_leg?: boolean;
  }>;
  bankTransactionAmount: number;
}): { valid: boolean; error?: string } {
  const bankLegs = entries.filter((e) => e.is_bank_leg === true);

  if (bankLegs.length === 0) {
    return {
      valid: false,
      error: 'Bank transaction must have exactly one bank leg',
    };
  }

  if (bankLegs.length > 1) {
    return {
      valid: false,
      error: 'Bank transaction cannot have multiple bank legs',
    };
  }

  const bankLeg = bankLegs[0]!;
  const diff = Math.abs(bankLeg.source_amount) - Math.abs(expectedAmount);

  if (diff > 0.01) {
    return {
      valid: false,
      error: `Bank leg amount (${bankLeg.source_amount}) does not match bank transaction amount (${expectedAmount}). Difference: ${diff.toFixed(2)}`,
    };
  }

  return { valid: true };
}

export async function validateIds(
  table: string,
  ids: string[],
  companyId: string,
  txn: Knex.Transaction,
) {
  if (ids.length === 0) {
    return;
  }

  const valid = await txn(table)
    .whereIn('id', ids)
    .where({ company_id: companyId, is_deleted: false })
    .pluck('id');

  const validIds = new Set(valid);
  const invalidIds = ids.filter((id) => !validIds.has(id));

  if (invalidIds.length) {
    throw new Error(`Invalid ${table} IDs: ${invalidIds.join(', ')}`);
  }
}

export async function resolveFx({
  entries,
  ledgerTxDate,
  sourceCurrencyId,
  reportingCurrencyId,
  bankTxnSystemRate,
}: {
  ledgerTxDate: Date;
  entries: LedgerEntryInput[];
  sourceCurrencyId: string;
  reportingCurrencyId: string;
  bankTxnSystemRate?: number | null;
}): Promise<{
  systemExRate: number;
  customExRate: number;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const isFx = sourceCurrencyId !== reportingCurrencyId;

  if (!isFx) {
    return {
      systemExRate: 1,
      customExRate: 1,
      warnings,
    };
  }

  // Fetch currency codes (just for clean warnings)
  const reportingCurr = await getCurrencyById(reportingCurrencyId);
  const sourceCurr = await getCurrencyById(sourceCurrencyId);

  // SYSTEM RATE (system -> bank override -> external lookup)
  let systemRate = 1;

  if (bankTxnSystemRate) {
    systemRate = bankTxnSystemRate;
  } else {
    const rate = await determineExchangeRate({
      date: toYMD(ledgerTxDate),
      fromCurrencyId: sourceCurrencyId,
      toCurrencyId: reportingCurrencyId,
    });

    if (!rate) {
      throw new AppError(
        `Failed to determine exchange rate for ${sourceCurr.code} to ${reportingCurr.code} on ${toYMD(ledgerTxDate)}`,
        {
          sourceCurrencyId,
          sourceCurrencyCode: sourceCurr.code,
          reportingCurrencyId,
          reportingCurrencyCode: reportingCurr.code,
          date: toYMD(ledgerTxDate),
        }, // details
        true, // report
      );
    }

    systemRate = rate;
  }

  // CUSTOM RATES (one final custom rate or fallback to system)
  const customRates = entries
    .map((e) => e.custom_exchange_rate ?? null)
    .filter((r) => r !== null) as number[];

  const uniqueRates = new Set(customRates);

  let finalCustomRate = systemRate; // default fallback
  if (customRates.length === 1) {
    finalCustomRate = customRates[0];
  } else if (uniqueRates.size === 1 && customRates.length > 1) {
    // All identical
    finalCustomRate = [...uniqueRates][0];
  } else if (uniqueRates.size > 1) {
    warnings.push(
      `Conflicting custom FX rates detected for ${sourceCurr.code} → ${reportingCurr.code} on ${toYMD(ledgerTxDate)}. Using system rate.`,
    );
    finalCustomRate = systemRate;
  }

  // Validate Rates
  if (
    finalCustomRate < 0 ||
    !Number.isFinite(finalCustomRate) ||
    systemRate < 0
  ) {
    const details = {
      sourceCurrencyId,
      sourceCurrencyCode: sourceCurr.code,
      reportingCurrencyId,
      reportingCurrencyCode: reportingCurr.code,
      date: toYMD(ledgerTxDate),
      systemRate,
    };

    logger.error(
      { details },
      `Invalid exchange rate for ${sourceCurr.code} to ${reportingCurr.code} on ${toYMD(ledgerTxDate)}`,
    );
    throw new AppError(
      `Invalid exchange rate for ${sourceCurr.code} to ${reportingCurr.code} on ${toYMD(ledgerTxDate)}`,
      details, // details
      true, // report
    );
  }

  if (finalCustomRate > 10_000) {
    warnings.push(`Suspiciously large FX rate: ${finalCustomRate}`);
  }

  if (finalCustomRate < 0.00001) {
    warnings.push(`Suspiciously small FX rate: ${finalCustomRate}.`);
  }

  for (const e of entries) {
    const amt = e.source_amount * finalCustomRate;

    if (Math.abs(amt) < 0.001) {
      warnings.push(
        `Converted amount for ledger entry into coa:${e.coa_id} is extremely small - ${amt}.`,
      );
    }

    if (Math.abs(amt) > 1_000_000_000) {
      warnings.push(
        `Converted amount for ledger entry into coa:${e.coa_id} is extremely large - ${amt}.`,
      );
    }
  }

  return {
    systemExRate: systemRate,
    customExRate: finalCustomRate,
    warnings,
  };
}

/**
 * Process a list of ledger entries to calculate the overall date range (minYMD, maxYMD),
 * a map of COA-specific bounds, and a list of transaction dates.
 *
 * This function does the following:
 * 1. Initializes variables for the overall date range, COA-specific bounds map, and transaction dates list.
 * 2. Iterates through the list of ledger entries and performs the following for each entry:
 *    a. Calculates the overall min/max YMD.
 *    b. Calculates COA-specific bounds.
 *    c. Collects the transaction date.
 * 3. Returns the populated variables.
 *
 * @param {LedgerEntryInput[]} entries
 * @return {{ transactionDates: Date[], bounds: Map<string, { min: string; max: string }>, minYMD: string | null, maxYMD: string | null }}
 */
export function processEntriesDates(entries: LedgerEntryInput[]) {
  // 1. Initialize for the overall date range (minYMD, maxYMD) and the COA-specific bounds map
  const bounds = new Map<string, { min: string; max: string }>();
  let minYMD: string | null = null;
  let maxYMD: string | null = null;

  // 2. Initialize for the list of transaction dates
  const transactionDates = [];

  // --- Start Single Loop ---
  for (const entry of entries) {
    const d = toYMD(entry.fs_date);

    // Part A: Calculate overall min/max YMD
    if (!minYMD || d < minYMD) minYMD = d;
    if (!maxYMD || d > maxYMD) maxYMD = d;

    // Part B: Calculate COA-specific bounds
    const b = bounds.get(entry.coa_id);
    if (!b) {
      bounds.set(entry.coa_id, { min: d, max: d });
    } else {
      if (d < b.min) b.min = d;
      if (d > b.max) b.max = d;
    }

    // Part C: Collect the transaction date (equivalent to your initial .map() call)
    transactionDates.push(toDate(entry.fs_date, 'start'));
  }
  // --- End Single Loop ---

  // Now all variables (transactionDates, bounds, minYMD, maxYMD) are populated.
  // ... continue with the rest of your function logic ...
  return { transactionDates, bounds, minYMD, maxYMD };
}
