import type {
  CategorizationTransaction,
  LedgerIntent,
  LedgerIntentEntry,
} from '@accountable-books/contracts/schema';

import { toDate, toYMD } from '../../shared/utils/date.utils.js';

import type { BankTransactionWithFilteredFields } from '../bankTransactions/bankTransactions.types.js';
import type { ContactType } from '../contacts/index.js';
import type {
  LedgerEntryInput,
  NewLedgerTransactionData,
} from '../ledgers/ledgers.types.js';
import type {
  CategorizationCandidateLine,
  CategorizationCandidateWithLines,
} from './candidates/candidates.types.js';

/**
 * Merges multiple ledger intents for the same bank transaction into a single
 * resolved intent.
 *
 * @param intents - Array of intents to merge (must share the same bank_transaction_id)
 * @param useLatest - If true, returns the latest intent verbatim with no merging
 * @returns Resolved intent or null if no intents are provided
 *
 * Core principles:
 * - Each intent represents a partial update.
 * - Intents are applied chronologically (oldest → newest).
 * - Field semantics:
 *   - undefined → no change
 *   - null → explicit clear
 *   - value → set / overwrite
 *
 * Merge behavior (when useLatest=false):
 * - Metadata from latest intent verbatim.
 * - desired_state merged: transaction fields cumulatively, entries specially.
 * - Entries with entry_id: accumulate, latest per-field wins.
 * - Entries without entry_id: only from latest intent that provides them.
 * - Latest intent with entries: [] clears all entries.
 */
export const mergeIntents = (
  intents: LedgerIntent[],
  useLatest: boolean = false,
): LedgerIntent | null => {
  if (intents.length === 0) {
    return null;
  }

  if (intents.length === 1) {
    return intents[0];
  }

  // Validate all intents belong to the same bank transaction
  const bankTxnId = intents[0].bank_transaction_id;
  if (!intents.every((i) => i.bank_transaction_id === bankTxnId)) {
    throw new Error('Cannot merge intents for different bank transactions');
  }

  // Sort intents oldest → newest
  const sortedIntents = [...intents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const latestIntent = sortedIntents[sortedIntents.length - 1];
  if (useLatest) return latestIntent;

  // Helper: apply only defined fields (undefined = no change, null allowed)
  const applyDefined = <T extends object>(target: T, source?: Partial<T>) => {
    if (!source) return;
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const value = (source as any)[key];
        if (value !== undefined) target[key as keyof T] = value;
      }
    }
  };

  // Base intent = latest intent (metadata preserved verbatim)
  const mergedIntent: LedgerIntent = structuredClone(latestIntent);
  const ds = mergedIntent.desired_state || {};
  mergedIntent.desired_state = ds;

  // Merge transaction-level fields (excluding entries)
  for (const intent of sortedIntents) {
    if (!intent.desired_state) continue;
    const { entries, ...txnFields } = intent.desired_state;
    applyDefined(ds, txnFields as Partial<typeof ds>);
  }

  // Merge entries if any intent touches them
  const hasAnyEntriesTouched = sortedIntents.some(
    (i) => i.desired_state?.entries !== undefined,
  );
  if (hasAnyEntriesTouched) {
    const entriesWithId = new Map<string, LedgerIntentEntry>();
    let entriesWithoutId: LedgerIntentEntry[] = [];

    for (const intent of sortedIntents) {
      const entries = intent.desired_state?.entries;
      if (!Array.isArray(entries)) continue;

      // Latest explicit clear
      if (intent === latestIntent && entries.length === 0) {
        entriesWithId.clear();
        entriesWithoutId = [];
        break;
      }

      for (const entry of entries) {
        if (entry.entry_id) {
          const existing = entriesWithId.get(entry.entry_id);
          if (existing) applyDefined(existing, entry);
          else entriesWithId.set(entry.entry_id, { ...entry });
        } else if (intent === latestIntent) {
          entriesWithoutId.push({ ...entry });
        }
      }
    }

    ds.entries = [...entriesWithId.values(), ...entriesWithoutId];
  }

  return mergedIntent;
};

export function detectCurrentState(
  entries: CategorizationTransaction[],
): 'bank_transaction' | 'candidate' | 'ledger' {
  const first = entries[0];

  if (
    entries.length === 1 &&
    first.categorization_status === 'uncategorized' &&
    !first.candidate_id &&
    !first.ledger_transaction_id
  ) {
    return 'bank_transaction';
  }

  if (
    first.categorization_status === 'proposed' &&
    first.candidate_id &&
    !first.ledger_transaction_id
  ) {
    return 'candidate';
  }

  if (first.ledger_transaction_id) {
    return 'ledger';
  }

  throw new Error('Unreachable transaction state');
}

/**
 * Resolves a nullable field from intent with proper null vs undefined handling.
 *
 * Semantics:
 * - null → explicit clear (return null)
 * - undefined → no change (use fallback)
 * - value → set/overwrite (return value)
 *
 * @param intentValue - Value from intent entry (can be null, undefined, or a value)
 * @param fallback - Fallback value to use if intentValue is undefined
 * @returns Resolved value or null
 */
function resolveNullableField<T>(
  intentValue: T | null | undefined,
  fallback: T | null | undefined,
): T | null {
  if (intentValue === null) return null;
  return intentValue ?? fallback ?? null;
}

/**
 * Safely converts a value to a number.
 * Handles string numbers from PostgreSQL NUMERIC types and frontend inputs.
 *
 * @param value - Value to convert (can be number, string, or unknown)
 * @returns Converted number
 * @throws Error if value cannot be converted to a number
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    if (isNaN(value)) {
      throw new Error('Cannot convert NaN to number');
    }
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Cannot convert string "${value}" to number`);
    }
    return parsed;
  }
  throw new Error(`Cannot convert ${typeof value} to number`);
}

/**
 * Resolves custom exchange rate with fallback chain.
 *
 * Priority:
 * 1. Intent's custom_exchange_rate (if provided)
 * 2. Candidate bank leg's custom_exchange_rate (if provided)
 * 3. Bank transaction's system_exchange_rate
 *
 * @param intent - Ledger intent with optional custom_exchange_rate
 * @param candidateBankLeg - Optional candidate bank leg for fallback
 * @param bankTransaction - Bank transaction for final fallback
 * @returns Resolved exchange rate
 */
export function resolveExchangeRate(
  intent: LedgerIntent,
  candidateBankLeg: CategorizationCandidateLine | null | undefined,
  bankTransaction: BankTransactionWithFilteredFields,
): number {
  const rate =
    intent.desired_state?.custom_exchange_rate ??
    candidateBankLeg?.custom_exchange_rate ??
    bankTransaction.system_exchange_rate;

  return toNumber(rate);
}

/**
 * Builds a bank leg entry from bank transaction and intent.
 *
 * @param bankTransaction - Bank transaction data
 * @param intent - Ledger intent
 * @param candidateBankLeg - Optional candidate bank leg for exchange rate fallback
 * @returns Bank leg ledger entry input
 */
export function buildBankLeg(
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  candidateBankLeg?: CategorizationCandidateLine | null,
): LedgerEntryInput {
  return {
    is_bank_leg: true,
    fs_date: toYMD(bankTransaction.date),
    coa_id: bankTransaction.bank_account_coa_id,
    source_currency_id: bankTransaction.bank_account_currency_id,
    source_amount: toNumber(bankTransaction.amount),
    custom_exchange_rate: resolveExchangeRate(
      intent,
      candidateBankLeg,
      bankTransaction,
    ),
    contact_id: bankTransaction.contact_id ?? null,
    contact_type: bankTransaction.contact_type_snapshot ?? null,
    description: bankTransaction.description ?? null,
  };
}

/**
 * Builds a non-bank leg entry from bank transaction state.
 *
 * Used when creating a new ledger transaction from an uncategorized bank transaction.
 *
 * @param intentEntry - Intent entry with field updates
 * @param bankTransaction - Bank transaction for fallback values
 * @param intent - Ledger intent for exchange rate resolution
 * @param intentEntriesCount - Total count of intent entries (determines if this is a split)
 * @returns Non-bank leg ledger entry input
 */
export function buildNonBankLegFromBankTransaction(
  intentEntry: LedgerIntentEntry,
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  intentEntriesCount: number,
): LedgerEntryInput {
  const isSplit = intentEntriesCount > 1;

  if (!intentEntry.source_amount && isSplit) {
    throw new Error('Split entries require explicit source_amount');
  }

  // Convert source_amount to number
  const sourceAmount =
    intentEntry.source_amount !== undefined
      ? toNumber(intentEntry.source_amount)
      : isSplit
        ? 0
        : toNumber(bankTransaction.amount);

  return {
    is_bank_leg: false,
    coa_id: intentEntry.coa_id,
    fs_date: intentEntry.fs_date || toYMD(bankTransaction.date),
    source_currency_id: bankTransaction.bank_account_currency_id,
    source_amount: sourceAmount,
    custom_exchange_rate: resolveExchangeRate(intent, null, bankTransaction),
    contact_id: resolveNullableField(
      intentEntry.contact_id,
      bankTransaction.contact_id,
    ),
    contact_type: resolveNullableField(
      intentEntry.contact_type,
      bankTransaction.contact_type_snapshot,
    ),
    description: resolveNullableField(
      intentEntry.description,
      bankTransaction.description,
    ),
    reference: resolveNullableField(
      intentEntry.reference,
      bankTransaction.reference,
    ),
    project_id: intentEntry.project_id === null ? null : intentEntry.project_id,
    human_reviewed: true,
    review_notes: intentEntry.review_notes,
    metadata: {
      ...(intentEntry.metadata || {}),
      ...(intentEntry.client_ref_id
        ? { client_ref_id: intentEntry.client_ref_id }
        : {}),
    },
  };
}

/**
 * Builds a non-bank leg entry from candidate state (single entry case).
 *
 * Used when updating a candidate that has a single non-bank leg.
 *
 * @param intentEntry - Intent entry with field updates
 * @param bankTransaction - Bank transaction for fallback values
 * @param intent - Ledger intent for exchange rate resolution
 * @param candidateLine - Candidate line to use as base for fallback values
 * @param candidateBankLeg - Candidate bank leg for exchange rate fallback
 * @returns Non-bank leg ledger entry input
 */
export function buildNonBankLegFromCandidateSingle(
  intentEntry: LedgerIntentEntry,
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  candidateLine: CategorizationCandidateLine | null,
  candidateBankLeg: CategorizationCandidateLine,
): LedgerEntryInput {
  return {
    is_bank_leg: false,
    coa_id: intentEntry.coa_id ?? candidateLine?.coa_id,
    fs_date:
      intentEntry.fs_date ??
      candidateLine?.fs_date ??
      toYMD(bankTransaction.date),
    source_currency_id: bankTransaction.bank_account_currency_id,
    source_amount: toNumber(bankTransaction.amount),
    custom_exchange_rate: resolveExchangeRate(
      intent,
      candidateBankLeg,
      bankTransaction,
    ),
    contact_id: resolveNullableField(
      intentEntry.contact_id,
      candidateLine?.contact_id ?? bankTransaction.contact_id ?? null,
    ),
    contact_type: resolveNullableField(
      intentEntry.contact_type,
      candidateLine?.contact_type ??
        bankTransaction.contact_type_snapshot ??
        null,
    ),
    description: resolveNullableField(
      intentEntry.description,
      candidateLine?.description ?? bankTransaction.description ?? null,
    ),
    reference: resolveNullableField(
      intentEntry.reference,
      bankTransaction.reference ?? null,
    ),
    project_id: resolveNullableField(
      intentEntry.project_id,
      candidateLine?.project_id,
    ),
    human_reviewed: intentEntry.human_reviewed ?? true,
    review_notes: intentEntry.review_notes ?? null,
    metadata: {
      ...(intentEntry.metadata || {}),
      ...(intentEntry.client_ref_id
        ? { client_ref_id: intentEntry.client_ref_id }
        : {}),
    },
  };
}

/**
 * Builds a non-bank leg entry from candidate state (multiple entries/split case).
 *
 * Used when replacing a candidate that has multiple non-bank legs (split transaction).
 *
 * @param intentEntry - Intent entry with field updates
 * @param bankTransaction - Bank transaction for fallback values
 * @param intent - Ledger intent for exchange rate resolution
 * @param candidateBankLeg - Candidate bank leg for fallback values
 * @returns Non-bank leg ledger entry input
 */
export function buildNonBankLegFromCandidateSplit(
  intentEntry: LedgerIntentEntry,
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  candidateBankLeg: CategorizationCandidateLine,
): LedgerEntryInput {
  // Convert source_amount to number
  const sourceAmount =
    intentEntry.source_amount !== undefined
      ? toNumber(intentEntry.source_amount)
      : 0;

  return {
    is_bank_leg: false,
    coa_id: intentEntry.coa_id, // Required in intent for splits
    fs_date:
      intentEntry.fs_date ??
      candidateBankLeg.fs_date ??
      toYMD(bankTransaction.date),
    source_currency_id: bankTransaction.bank_account_currency_id,
    source_amount: sourceAmount,
    custom_exchange_rate: resolveExchangeRate(
      intent,
      candidateBankLeg,
      bankTransaction,
    ),
    contact_id: resolveNullableField(
      intentEntry.contact_id,
      candidateBankLeg.contact_id ?? bankTransaction.contact_id ?? null,
    ),
    contact_type: resolveNullableField(
      intentEntry.contact_type,
      candidateBankLeg.contact_type ??
        bankTransaction.contact_type_snapshot ??
        null,
    ),
    description: resolveNullableField(
      intentEntry.description,
      candidateBankLeg.description ?? bankTransaction.description ?? null,
    ),
    reference: resolveNullableField(
      intentEntry.reference,
      bankTransaction.reference ?? null,
    ),
    project_id: resolveNullableField(intentEntry.project_id, undefined),
    human_reviewed: intentEntry.human_reviewed ?? true,
    review_notes: intentEntry.review_notes ?? null,
    metadata: {
      ...(intentEntry.metadata || {}),
      ...(intentEntry.client_ref_id
        ? { client_ref_id: intentEntry.client_ref_id }
        : {}),
    },
  };
}

/**
 * Builds a non-bank leg entry from ledger state (updating existing entry).
 *
 * Used when updating an existing ledger entry that was matched by entry_id.
 *
 * @param intentEntry - Intent entry with field updates
 * @param intent - Ledger intent for exchange rate resolution
 * @param ledgerEntry - Existing ledger entry to use as base
 * @returns Non-bank leg ledger entry input
 */
export function buildNonBankLegFromLedgerUpdate(
  intentEntry: LedgerIntentEntry,
  intent: LedgerIntent,
  ledgerEntry: {
    id: string;
    coa_id: string;
    fs_date: Date;
    source_currency_id: string;
    source_amount: number;
    custom_exchange_rate: number;
    contact_id: string | null;
    contact_type: ContactType | null;
    description: string | null;
    reference: string | null;
    project_id: string | null;
    human_reviewed: boolean | null;
    review_notes: string | null;
    metadata?: Record<string, unknown>;
  },
): LedgerEntryInput {
  // Convert source_amount to number if provided in intent, otherwise use ledger entry value
  const sourceAmount =
    intentEntry.source_amount !== undefined
      ? toNumber(intentEntry.source_amount)
      : toNumber(ledgerEntry.source_amount);

  // Convert custom_exchange_rate to number
  const customExchangeRate = (() => {
    const rate =
      intent.desired_state?.custom_exchange_rate ??
      ledgerEntry.custom_exchange_rate;
    return toNumber(rate);
  })();

  return {
    id: ledgerEntry.id,
    is_bank_leg: false,
    coa_id: intentEntry.coa_id ?? ledgerEntry.coa_id,
    fs_date: intentEntry.fs_date ?? toYMD(ledgerEntry.fs_date),
    source_currency_id: ledgerEntry.source_currency_id,
    source_amount: sourceAmount,
    custom_exchange_rate: customExchangeRate,
    contact_id: resolveNullableField(
      intentEntry.contact_id,
      ledgerEntry.contact_id,
    ),
    contact_type: resolveNullableField(
      intentEntry.contact_type,
      ledgerEntry.contact_type,
    ),
    description: resolveNullableField(
      intentEntry.description,
      ledgerEntry.description,
    ),
    reference: resolveNullableField(
      intentEntry.reference,
      ledgerEntry.reference,
    ),
    project_id: resolveNullableField(
      intentEntry.project_id,
      ledgerEntry.project_id,
    ),
    human_reviewed: intentEntry.human_reviewed ?? true,
    review_notes: intentEntry.review_notes ?? ledgerEntry.review_notes,
    metadata: {
      ...(ledgerEntry.metadata || {}),
      ...(intentEntry.metadata || {}),
      ...(intentEntry.client_ref_id
        ? { client_ref_id: intentEntry.client_ref_id }
        : {}),
    },
  };
}

/**
 * Builds a non-bank leg entry from ledger state (adding new entry/split).
 *
 * Used when adding a new split entry to an existing ledger transaction.
 *
 * @param intentEntry - Intent entry with field updates
 * @param bankTransaction - Bank transaction for fallback values
 * @param intent - Ledger intent for exchange rate resolution
 * @param ledgerTxn - Existing ledger transaction for fallback values
 * @param templateEntry - Template entry from existing ledger (if available) for fallback values
 * @returns Non-bank leg ledger entry input
 */
export function buildNonBankLegFromLedgerSplit(
  intentEntry: LedgerIntentEntry,
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  ledgerTxn: {
    date: Date;
    source_transaction_currency_id: string;
    contact_id: string | null;
    contact_type: ContactType | null;
    description: string | null;
  },
  templateEntry?: {
    fs_date: Date;
    source_currency_id: string;
    custom_exchange_rate: number;
    contact_id: string | null;
    contact_type: ContactType | null;
    description: string | null;
  } | null,
): LedgerEntryInput {
  // Convert source_amount to number
  if (
    intentEntry.source_amount === undefined ||
    intentEntry.source_amount === null
  ) {
    throw new Error('source_amount is required for ledger entry');
  }
  const sourceAmount = toNumber(intentEntry.source_amount);

  // Convert custom_exchange_rate to number
  const customExchangeRate = (() => {
    const rate =
      intent.desired_state?.custom_exchange_rate ??
      templateEntry?.custom_exchange_rate;
    if (rate === null || rate === undefined) return undefined;
    return toNumber(rate);
  })();

  return {
    is_bank_leg: false,
    coa_id: intentEntry.coa_id,
    fs_date:
      intentEntry.fs_date ??
      (templateEntry ? toYMD(templateEntry.fs_date) : toYMD(ledgerTxn.date)),
    source_currency_id:
      templateEntry?.source_currency_id ??
      ledgerTxn.source_transaction_currency_id,
    source_amount: sourceAmount,
    custom_exchange_rate: customExchangeRate,
    contact_id: resolveNullableField(
      intentEntry.contact_id,
      templateEntry?.contact_id ?? ledgerTxn.contact_id ?? null,
    ),
    contact_type: resolveNullableField(
      intentEntry.contact_type,
      templateEntry?.contact_type ?? ledgerTxn.contact_type ?? null,
    ),
    description: resolveNullableField(
      intentEntry.description,
      templateEntry?.description ?? ledgerTxn.description ?? null,
    ),
    reference: resolveNullableField(
      intentEntry.reference,
      (ledgerTxn as { reference?: string | null }).reference ?? null,
    ),
    project_id: resolveNullableField(intentEntry.project_id, undefined),
    human_reviewed: intentEntry.human_reviewed ?? true,
    review_notes: intentEntry.review_notes ?? null,
    metadata: {
      ...(intentEntry.metadata || {}),
      ...(intentEntry.client_ref_id
        ? { client_ref_id: intentEntry.client_ref_id }
        : {}),
    },
  };
}

/**
 * Builds ledger transaction metadata from bank transaction and intent.
 *
 * Used when creating new ledger transactions from bank transactions.
 *
 * @param bankTransaction - Bank transaction data
 * @param intent - Ledger intent
 * @param categorizationSource - Source of categorization (e.g., 'manual', 'ml', 'rule')
 * @param candidateId - Optional candidate ID if transaction came from a candidate
 * @returns Ledger transaction metadata (without entries)
 */
export function buildLedgerTransactionMetadata(
  bankTransaction: BankTransactionWithFilteredFields,
  intent: LedgerIntent,
  categorizationSource: 'manual' | 'ml' | 'ml_heuristic' | 'rule',
  candidateId?: string | null,
): Omit<NewLedgerTransactionData, 'transactions'> {
  return {
    date: bankTransaction.date,
    transaction_source: 'bank_transaction',
    categorization_source: categorizationSource,
    description: bankTransaction.description ?? null,
    reference: bankTransaction.reference ?? null,
    note: bankTransaction.additional_notes ?? null,
    contact_id: bankTransaction.contact_id,
    contact_type: bankTransaction.contact_type_snapshot,
    source_transaction_id: bankTransaction.id,
    source_transaction_date: toDate(bankTransaction.date, 'start'),
    source_transaction_amount: toNumber(bankTransaction.amount),
    source_transaction_currency_id: bankTransaction.bank_account_currency_id,
    ...(candidateId ? { categorization_candidate_id: candidateId } : {}),
  };
}

/**
 * Builds ledger transaction metadata from candidate and bank transaction.
 *
 * Used when creating new ledger transactions from candidates.
 *
 * @param candidate - Candidate data with lines
 * @param bankTransaction - Bank transaction data
 * @returns Ledger transaction metadata (without entries)
 */
export function buildLedgerTransactionMetadataFromCandidate(
  candidate: CategorizationCandidateWithLines,
  bankTransaction: BankTransactionWithFilteredFields,
): Omit<NewLedgerTransactionData, 'transactions'> {
  return {
    date: toDate(bankTransaction.date, 'start'),
    transaction_source: 'bank_transaction',
    categorization_source: candidate.source,
    description: candidate.description ?? null,
    reference: candidate.reference ?? null,
    note: bankTransaction.additional_notes ?? null,
    contact_id: candidate.contact_id,
    contact_type: candidate.contact_type ?? null,
    source_transaction_id: candidate.bank_transaction_id,
    source_transaction_date: toDate(bankTransaction.date, 'start'),
    source_transaction_amount: toNumber(bankTransaction.amount),
    source_transaction_currency_id: bankTransaction.bank_account_currency_id,
    categorization_candidate_id: candidate.id,
  };
}
