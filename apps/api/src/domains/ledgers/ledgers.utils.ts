import type { Knex } from 'knex';

import { AppError, logger, toDate, toYMD } from '../../shared/index.js';
import { getCurrencyById } from '../currencies/currencies.utils.js';
import { determineExchangeRate } from '../exchangeRates/exchangeRates.utils.js';

import type {
  LedgerEntry,
  LedgerEntryInput,
  LedgerTransaction,
  NewLedgerTransactionData,
} from './ledgers.types.js';

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
  // Check magnitude only, as per user feedback (signs might differ for debit/credit)
  const diff = Math.abs(
    Math.abs(bankLeg.source_amount) - Math.abs(expectedAmount),
  );

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
    return new Set<string>();
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

  return validIds;
}

export async function fetchLookupMap({
  table,
  ids,
  companyId,
  txn,
}: {
  table: 'contacts' | 'projects';
  ids: string[];
  companyId: string;
  txn: Knex.Transaction;
}): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const labelColumn = table === 'contacts' ? 'display_name' : 'name';

  const rows = await txn(table)
    .whereIn('id', ids)
    .where({ company_id: companyId, is_deleted: false })
    .select('id', labelColumn);

  const map = new Map(
    rows.map((row) => [String(row.id), row[labelColumn] as string]),
  );
  const invalidIds = ids.filter((id) => !map.has(id));

  if (invalidIds.length) {
    throw new Error(`Invalid ${table} IDs: ${invalidIds.join(', ')}`);
  }

  return map;
}

export async function resolveFx({
  entries,
  ledgerTxDate,
  sourceCurrencyId,
  reportingCurrencyId,
  bankTxnSystemRate,
  trx,
}: {
  ledgerTxDate: Date;
  entries: LedgerEntryInput[];
  sourceCurrencyId: string;
  reportingCurrencyId: string;
  bankTxnSystemRate?: number | null;
  trx?: Knex.Transaction;
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

  // CUSTOM RATES (one final custom rate or fallback to system)
  const customRates = entries
    .map((e) => e.custom_exchange_rate ?? null)
    .filter((r) => r !== null) as number[];

  const uniqueRates = new Set(customRates);

  // SYSTEM RATE (system -> bank override -> external lookup)
  let systemRate = 1;
  if (bankTxnSystemRate) {
    systemRate = bankTxnSystemRate;
  } else {
    const rate = await determineExchangeRate({
      date: toYMD(ledgerTxDate),
      fromCurrencyId: sourceCurrencyId,
      toCurrencyId: reportingCurrencyId,
      trx,
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

  let finalCustomRate = systemRate; // default fallback
  if (customRates.length === 1) {
    finalCustomRate = customRates[0];
  } else if (uniqueRates.size === 1 && customRates.length > 1) {
    // All identical
    finalCustomRate = [...uniqueRates][0]!;
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

/**
 * Field classifications for ledger transactions and entries
 *
 * These define which fields can be updated in-place vs require new transactions
 */

// Transaction-level metadata fields (can be updated in-place)
export const TRANSACTION_METADATA_FIELDS = new Set([
  'description',
  'reference',
  'note',
  'metadata',
] as const);

// Transaction-level fields that are immutable (cannot be changed)
export const TRANSACTION_IMMUTABLE_FIELDS = new Set([
  'date',
  'transaction_source',
  'categorization_source',
  'source_transaction_id',
  'source_transaction_date',
  'source_transaction_amount',
  'source_transaction_currency_id',
  'categorization_candidate_id',
] as const);

// Entry-level metadata fields (can be updated in-place)
export const ENTRY_METADATA_FIELDS = new Set([
  'description',
  'metadata',
  'human_reviewed',
  'review_notes',
  'reviewed_by_id',
  'reviewed_at',
] as const);

// Entry-level accounting fields (require new transaction)
export const ENTRY_ACCOUNTING_FIELDS = new Set([
  'coa_id',
  'custom_exchange_rate',
  'source_amount', // Immutable for bank leg of bank transaction
  'source_currency_id', // Immutable for bank transactions
  'project_id',
  'fs_date',
  'contact_id',
  'contact_type',
] as const);

/**
 * Safely normalize a date value to YMD string for comparison
 * Handles Date objects, YMD strings, or null/undefined
 * Returns null if input is null/undefined or invalid
 */
export function normalizeDateForComparison(value: unknown): string | null {
  if (value == null) return null;

  try {
    return toYMD(value as string | Date);
  } catch {
    // toYMD failed (invalid format or null/undefined)
    return null;
  }
}

/**
 * Detect what fields have changed between existing ledger transaction and proposed changes
 *
 * This function compares the existing ledger transaction and its entries with the proposed
 * changes to determine:
 * 1. Whether any changes exist
 * 2. What specific fields changed at transaction and entry levels
 * 3. Whether changes are metadata-only or accounting changes
 * 4. Whether bank leg immutability rules are violated (if isBankTransaction = true)
 *
 * Transaction-level fields like date, contact_id are IMMUTABLE and should never appear
 * in proposed changes.
 *
 * Bank Leg Immutability: For bank transactions, the bank leg (is_bank_leg = true) must have
 * immutable coa_id, source_currency_id, and source_amount. Any attempt to change these
 * fields will result in bankLegViolation being populated.
 *
 * @param existing - Existing ledger transaction from database
 * @param existingEntries - Existing ledger entries from database
 * @param proposed - Proposed changes to the transaction
 * @param isBankTransaction - Whether this is a bank transaction (enables bank leg validation)
 * @returns Change detection result including bank leg violation info
 */
export function detectChangedFields({
  existing,
  existingEntries,
  proposed,
  isBankTransaction = false,
}: {
  existing: LedgerTransaction;
  existingEntries: LedgerEntry[];
  proposed: Partial<NewLedgerTransactionData>;
  isBankTransaction?: boolean;
}): {
  hasChanges: boolean;
  transactionChanges: Set<string>;
  entryChanges: Map<string, Set<string>>; // Map of entry_id -> changed fields
  isMetadataOnly: boolean;
  isAccountingChange: boolean;
  bankLegViolation?: {
    entryIndex: number;
    violatedFields: string[];
    message: string;
  };
} {
  const transactionChanges = new Set<string>();
  const entryChanges = new Map<string, Set<string>>();

  // // Define which fields are metadata vs accounting
  // const TRANSACTION_METADATA_FIELDS = new Set([
  //   'description',
  //   'reference',
  //   'note',
  //   'metadata',
  // ]);

  // const ENTRY_METADATA_FIELDS = new Set(['description', 'metadata']);

  // const ENTRY_ACCOUNTING_FIELDS = new Set([
  //   'coa_id',
  //   'source_amount',
  //   'source_currency_id', // Not editable for bank transactions
  //   'custom_exchange_rate',
  //   'project_id',
  //   'fs_date',
  //   'contact_id',
  //   'contact_type',
  //   'human_reviewed',
  //   'review_notes',
  // ]);

  // Helper to compare values with epsilon for numbers
  const areValuesEqual = (a: unknown, b: unknown): boolean => {
    // Null/undefined equivalence
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    const isNumericString = (value: unknown): value is string => {
      if (typeof value !== 'string') return false;
      const trimmed = value.trim();
      if (trimmed === '') return false;
      return !Number.isNaN(Number(trimmed));
    };

    // Date comparison: handle Date objects or YMD strings
    // Check if either value looks like a date (Date object or YMD string pattern)
    const aIsDateLike =
      a instanceof Date ||
      (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a));
    const bIsDateLike =
      b instanceof Date ||
      (typeof b === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b));

    if (aIsDateLike || bIsDateLike) {
      const aYMD = normalizeDateForComparison(a);
      const bYMD = normalizeDateForComparison(b);
      return aYMD === bYMD;
    }

    // Number comparison with epsilon (supports numeric strings)
    if (
      typeof a === 'number' ||
      typeof b === 'number' ||
      isNumericString(a) ||
      isNumericString(b)
    ) {
      const aNum = typeof a === 'number' ? a : Number(a);
      const bNum = typeof b === 'number' ? b : Number(b);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return Math.abs(aNum - bNum) < 0.01;
      }
    }

    // Number comparison with epsilon
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < 0.01;
    }

    // Object comparison (for metadata)
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    // String comparison
    return String(a) === String(b);
  };

  // 1. Check transaction-level changes
  for (const field of TRANSACTION_METADATA_FIELDS) {
    if (field in proposed) {
      const proposedValue = proposed[field as keyof typeof proposed];
      const existingValue = existing[field as keyof LedgerTransaction];

      if (!areValuesEqual(existingValue, proposedValue)) {
        transactionChanges.add(field);
      }
    }
  }

  // 2. Check entry-level changes (structural + field changes)
  const proposedEntries = proposed.transactions ?? [];

  const existingBankLegIndex = existingEntries.findIndex(
    (entry) => entry.is_bank_leg === true,
  );
  const proposedBankLegIndex = proposedEntries.findIndex(
    (entry) => entry.is_bank_leg === true,
  );

  const existingNonBankEntries = existingEntries.filter(
    (entry) => !entry.is_bank_leg,
  );
  const proposedNonBankEntries = proposedEntries.filter(
    (entry) => !entry.is_bank_leg,
  );

  // Structural change: entry count mismatch (non-bank legs)
  if (proposedNonBankEntries.length !== existingNonBankEntries.length) {
    return {
      hasChanges: true,
      transactionChanges,
      entryChanges,
      isMetadataOnly: false,
      isAccountingChange: true,
    };
  }

  // Structural change: bank leg missing on either side
  if (
    (existingBankLegIndex === -1 && proposedBankLegIndex !== -1) ||
    (existingBankLegIndex !== -1 && proposedBankLegIndex === -1)
  ) {
    return {
      hasChanges: true,
      transactionChanges,
      entryChanges,
      isMetadataOnly: false,
      isAccountingChange: true,
    };
  }

  const existingNonBankById = new Map<string, LedgerEntry>();
  existingNonBankEntries.forEach((entry) => {
    existingNonBankById.set(entry.id, entry);
  });

  const proposedNonBankById = new Map<string, LedgerEntryInput>();
  for (const entry of proposedNonBankEntries) {
    if (!entry.id) {
      return {
        hasChanges: true,
        transactionChanges,
        entryChanges,
        isMetadataOnly: false,
        isAccountingChange: true,
      };
    }
    proposedNonBankById.set(entry.id, entry);
  }

  for (const existingEntry of existingNonBankEntries) {
    const proposedEntry = proposedNonBankById.get(existingEntry.id);
    if (!proposedEntry) {
      return {
        hasChanges: true,
        transactionChanges,
        entryChanges,
        isMetadataOnly: false,
        isAccountingChange: true,
      };
    }

    const changedFields = new Set<string>();

    for (const field of ENTRY_METADATA_FIELDS) {
      if (field in proposedEntry) {
        const proposedValue =
          proposedEntry[field as keyof typeof proposedEntry];
        const existingValue = existingEntry[field as keyof LedgerEntry];

        if (!areValuesEqual(existingValue, proposedValue)) {
          changedFields.add(field);
        }
      }
    }

    for (const field of ENTRY_ACCOUNTING_FIELDS) {
      if (field in proposedEntry) {
        const proposedValue =
          proposedEntry[field as keyof typeof proposedEntry];
        const existingValue = existingEntry[field as keyof LedgerEntry];

        if (!areValuesEqual(existingValue, proposedValue)) {
          changedFields.add(field);
        }
      }
    }

    if (changedFields.size > 0) {
      entryChanges.set(existingEntry.id, changedFields);
    }
  }

  for (const proposedEntry of proposedNonBankEntries) {
    if (!proposedEntry.id) continue;
    if (!existingNonBankById.has(proposedEntry.id)) {
      return {
        hasChanges: true,
        transactionChanges,
        entryChanges,
        isMetadataOnly: false,
        isAccountingChange: true,
      };
    }
  }

  // 2a. Bank Leg Immutability Validation (if bank transaction)
  let bankLegViolation:
    | {
        entryIndex: number;
        violatedFields: string[];
        message: string;
      }
    | undefined;

  if (isBankTransaction) {
    if (existingBankLegIndex !== -1 && proposedBankLegIndex !== -1) {
      const existingBankLeg = existingEntries[existingBankLegIndex]!;
      const proposedBankLeg = proposedEntries[proposedBankLegIndex];

      if (proposedBankLeg) {
        const immutableBankLegFields = [
          'coa_id',
          'source_currency_id',
          'source_amount',
        ] as const;
        const violatedFields: string[] = [];

        for (const field of immutableBankLegFields) {
          if (field in proposedBankLeg) {
            const proposedValue =
              proposedBankLeg[field as keyof typeof proposedBankLeg];
            const existingValue = existingBankLeg[field as keyof LedgerEntry];

            if (!areValuesEqual(existingValue, proposedValue)) {
              violatedFields.push(field);
            }
          }
        }

        if (violatedFields.length > 0) {
          bankLegViolation = {
            entryIndex: existingBankLegIndex,
            violatedFields,
            message: `Bank leg immutability violation: Cannot change ${violatedFields.join(', ')} on bank leg. These fields must always match the source bank transaction.`,
          };
        }
      }
    }
  }

  // 3. Determine if any changes exist
  const hasChanges = transactionChanges.size > 0 || entryChanges.size > 0;

  // 4. Classify changes
  let hasAccountingChange = false;
  let hasMetadataChange = false;

  // Transaction-level changes are always metadata (accounting fields are immutable)
  if (transactionChanges.size > 0) {
    hasMetadataChange = true;
  }

  // Entry-level changes need classification
  for (const changedFields of entryChanges.values()) {
    for (const field of changedFields) {
      if (ENTRY_ACCOUNTING_FIELDS.has(field as never)) {
        hasAccountingChange = true;
      }
      if (ENTRY_METADATA_FIELDS.has(field as never)) {
        hasMetadataChange = true;
      }
    }
  }

  const isMetadataOnly =
    hasChanges && hasMetadataChange && !hasAccountingChange;
  const isAccountingChange = hasAccountingChange;

  return {
    hasChanges,
    transactionChanges,
    entryChanges,
    isMetadataOnly,
    isAccountingChange,
    ...(bankLegViolation && { bankLegViolation }),
  };
}
