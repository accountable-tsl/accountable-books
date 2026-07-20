import type { AccountingBasis } from '@accountable-books/contracts/schema';

import {
  buildSignalFactsHash,
  buildSignalFingerprint,
} from './close-signals.fingerprint.js';

import type { AccountElementKey } from '../../../../bootstrap/catalogs/accounting/account-elements.js';
import type {
  CloseReviewSignalCode,
  CloseReviewSignalInput,
  SignalEvaluationContext,
  SignalLedgerEntry,
  SignalLedgerTransaction,
} from './close-signals.types.js';

// ── Account taxonomy sets ────────────────────────────────────────────

const INCOME_ELEMENT_KEYS = new Set<AccountElementKey>([
  'income',
  'revenue',
  'other_income',
]);
const EXPENSE_ELEMENT_KEYS = new Set<AccountElementKey>([
  'expenses',
  'cost_of_sales',
  'operating_expenses',
  'non_operating_expenses',
]);
const CAPEX_ELEMENT_KEYS = new Set<AccountElementKey>(['non_current_asset']);
const EQUITY_ELEMENT_KEYS = new Set<AccountElementKey>([
  'contributed_capital',
  'reserves',
  'other_equity',
]);

const DEPRECIATION_AMORTIZATION_TYPE_KEY = 'exp_opex_depreciation_amortization';

/** Accumulated depreciation/amortization contra accounts on fixed assets. */
const ACCUMULATED_DEPRECIATION_TYPE_KEYS = new Set<string>([
  'nca_ppe_contra',
  'nca_investment_property_contra',
  'nca_rou_asset_contra',
  'nca_intangible_asset_contra',
]);

/** Bank / cash-equivalent destinations a manual journal should not post to. */
const BANK_TYPE_KEYS = new Set<string>(['ca_bank', 'ca_cash_equivalent']);

/**
 * Expense types that are inherently pay-as-you-go and not accrual-bypass
 * concerns even for accrual companies (bank charges, finance costs), plus tax
 * which is handled as a period-level finding.
 */
const DIRECT_EXPENSE_EXCLUDED_TYPE_KEYS = new Set<string>([
  'exp_opex_bank_fees',
  'exp_nopex_finance_costs',
  'exp_nopex_tax',
]);

/** Accounts where a counterparty and supporting document are expected. */
const REQUIRES_COUNTERPARTY_TYPE_KEYS = new Set<string>([
  'ca_trade_receivable',
  'cl_trade_payable',
  'ca_due_from_related_party',
  'cl_due_to_related_parties',
  'ca_prepayment',
  'cl_contract_liabilities',
  'ca_contract_asset',
  'ca_other_receivable',
  'cl_other_payables',
]);

// ── Public entry point ───────────────────────────────────────────────

/**
 * Evaluate the durable close review signals for one posted ledger transaction.
 *
 * Pure: it performs no IO and only reads the data it is given, so it can be
 * unit-tested without a database.
 *
 * Source-specific rules run by `transactionSource`; metadata-completeness rules
 * run for any source. The accounting basis is a lens — the direct-to-P&L
 * signals only fire for modified accrual, where bypassing receivables/payables
 * is a review concern.
 */
export function evaluateLedgerTransactionSignals(
  txn: SignalLedgerTransaction,
  entries: SignalLedgerEntry[],
  context: SignalEvaluationContext,
): CloseReviewSignalInput[] {
  const signals: CloseReviewSignalInput[] = [];

  if (txn.transactionSource === 'bank_transaction') {
    signals.push(...evaluateBankSourcedSignals(txn, entries, context));
  } else if (txn.transactionSource === 'manual_journal') {
    signals.push(...evaluateJournalSourcedSignals(txn, entries, context));
  }

  signals.push(...evaluateMetadataCompleteness(txn, entries, context));

  return dedupeByFingerprint(signals);
}

// ── Bank-sourced rules ───────────────────────────────────────────────

function evaluateBankSourcedSignals(
  txn: SignalLedgerTransaction,
  entries: SignalLedgerEntry[],
  context: SignalEvaluationContext,
): CloseReviewSignalInput[] {
  const offsetLegs = entries.filter((entry) => !entry.isBankLeg);
  if (offsetLegs.length === 0) return [];

  const signals: CloseReviewSignalInput[] = [];

  for (const leg of offsetLegs) {
    const code = classifyBankOffsetLeg(leg, context);
    if (code) signals.push(buildSignal(code, txn, context, leg));

    if (leg.isMonetary) {
      signals.push(buildSignal('monetary_fx_leg', txn, context, leg));
    }
  }

  return signals;
}

/**
 * Classify a single offset (non-bank) leg of a bank transaction into at most
 * one structural signal. Order matters: fallback (parked, not classified) and
 * non-cash destinations (wrong for any business) take precedence over the
 * accrual-only direct-to-P&L checks.
 */
function classifyBankOffsetLeg(
  leg: SignalLedgerEntry,
  context: SignalEvaluationContext,
): CloseReviewSignalCode | null {
  if (leg.labelRole === 'fallback') return 'posted_to_fallback_account';
  if (isNonCashDestination(leg)) return 'bank_offset_to_non_cash_account';
  if (CAPEX_ELEMENT_KEYS.has(leg.accountElementKey)) {
    return 'bank_offset_to_capex';
  }

  if (context.accountingBasis === 'modified_accrual_basis') {
    if (INCOME_ELEMENT_KEYS.has(leg.accountElementKey)) {
      return 'bank_offset_direct_to_revenue';
    }
    if (isDirectExpenseConcern(leg, context)) {
      return 'bank_offset_direct_to_expense';
    }
  }

  return null;
}

/**
 * Destinations that should essentially never be the direct counterpart of a
 * bank movement: depreciation/amortization expense, accumulated depreciation
 * (contra asset), and equity (contributed capital, reserves, retained earnings,
 * other equity). Basis-agnostic.
 */
function isNonCashDestination(leg: SignalLedgerEntry): boolean {
  if (leg.accountTypeKey === DEPRECIATION_AMORTIZATION_TYPE_KEY) return true;
  if (leg.accountElementKey === 'contra_asset') return true;
  return EQUITY_ELEMENT_KEYS.has(leg.accountElementKey);
}

function isDirectExpenseConcern(
  leg: SignalLedgerEntry,
  context: SignalEvaluationContext,
): boolean {
  if (!EXPENSE_ELEMENT_KEYS.has(leg.accountElementKey)) return false;
  if (DIRECT_EXPENSE_EXCLUDED_TYPE_KEYS.has(leg.accountTypeKey)) return false;
  if (
    context.directExpenseMinAmount !== undefined &&
    Math.abs(leg.amount) < context.directExpenseMinAmount
  ) {
    return false;
  }
  return true;
}

// ── Journal-sourced rules ────────────────────────────────────────────

function evaluateJournalSourcedSignals(
  txn: SignalLedgerTransaction,
  entries: SignalLedgerEntry[],
  context: SignalEvaluationContext,
): CloseReviewSignalInput[] {
  const signals: CloseReviewSignalInput[] = [];

  for (const leg of entries) {
    if (BANK_TYPE_KEYS.has(leg.accountTypeKey)) {
      signals.push(buildSignal('journal_to_bank_account', txn, context, leg));
    }
  }

  if (hasDepreciationPairingMismatch(entries)) {
    signals.push(
      buildSignal('journal_depreciation_pairing_mismatch', txn, context, null, {
        details: {
          accountTypeKeys: entries.map((entry) => entry.accountTypeKey),
        },
      }),
    );
  }

  return signals;
}

/**
 * A journal touching accumulated depreciation should pair with either
 * depreciation/amortization expense (periodic charge) or a fixed asset
 * (disposal). Neither present means the accumulated-depreciation account was
 * likely moved by something unrelated.
 */
function hasDepreciationPairingMismatch(entries: SignalLedgerEntry[]): boolean {
  const touchesAccumulatedDepreciation = entries.some((entry) =>
    ACCUMULATED_DEPRECIATION_TYPE_KEYS.has(entry.accountTypeKey),
  );
  if (!touchesAccumulatedDepreciation) return false;

  const hasDepreciationExpense = entries.some(
    (entry) => entry.accountTypeKey === DEPRECIATION_AMORTIZATION_TYPE_KEY,
  );
  const hasFixedAsset = entries.some(
    (entry) => entry.accountElementKey === 'non_current_asset',
  );

  return !hasDepreciationExpense && !hasFixedAsset;
}

// ── Metadata-completeness rules (any source) ─────────────────────────

function evaluateMetadataCompleteness(
  txn: SignalLedgerTransaction,
  entries: SignalLedgerEntry[],
  context: SignalEvaluationContext,
): CloseReviewSignalInput[] {
  const counterpartyLegs = entries.filter((entry) =>
    REQUIRES_COUNTERPARTY_TYPE_KEYS.has(entry.accountTypeKey),
  );
  if (counterpartyLegs.length === 0) return [];

  const signals: CloseReviewSignalInput[] = [];

  // Contact is a per-line attribute — each receivable/payable line needs its own
  // counterparty, for any source.
  for (const leg of counterpartyLegs) {
    if (leg.contactId === null) {
      signals.push(
        buildSignal('posting_missing_required_contact', txn, context, leg),
      );
    }
  }

  // A supporting document is a transaction-level artifact, and only a realistic
  // expectation for manually journaled receivable/payable postings. Bank-feed
  // postings routinely have no in-app document, so flagging them is pure noise.
  if (
    txn.transactionSource === 'manual_journal' &&
    !txn.hasSupportingDocument
  ) {
    signals.push(
      buildSignal('posting_missing_supporting_doc', txn, context, null, {
        details: {
          coaIds: uniqueSorted(counterpartyLegs.map((leg) => leg.coaId)),
          accountTypeKeys: uniqueSorted(
            counterpartyLegs.map((leg) => leg.accountTypeKey),
          ),
        },
        factsExtra: {
          coaIds: uniqueSorted(counterpartyLegs.map((leg) => leg.coaId)),
        },
      }),
    );
  }

  return signals;
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildSignal(
  code: CloseReviewSignalCode,
  txn: SignalLedgerTransaction,
  context: SignalEvaluationContext,
  leg: SignalLedgerEntry | null,
  options: {
    details?: Record<string, unknown>;
    factsExtra?: Record<string, unknown>;
  } = {},
): CloseReviewSignalInput {
  const coaId = leg?.coaId ?? null;
  const amount = leg?.amount ?? null;
  const accountTypeKey = leg?.accountTypeKey ?? null;
  const accountElementKey = leg?.accountElementKey ?? null;

  return {
    code,
    ledgerTransactionId: txn.ledgerTransactionId,
    ledgerEntryId: leg?.ledgerEntryId ?? null,
    coaId,
    accountTypeKey,
    accountElementKey,
    amount,
    fingerprint: buildSignalFingerprint({
      companyId: txn.companyId,
      fiscalYear: txn.fiscalYear,
      periodNumber: txn.periodNumber,
      periodType: txn.periodType,
      ledgerTransactionId: txn.ledgerTransactionId,
      code,
      coaId,
      ledgerEntryId: leg?.ledgerEntryId ?? null,
    }),
    factsHash: buildSignalFactsHash({
      amount,
      coaId,
      categorizationSource: txn.categorizationSource,
      accountTypeKey,
      accountingBasis: context.accountingBasis,
      extra: options.factsExtra,
    }),
    details: options.details ?? {},
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function dedupeByFingerprint(
  signals: CloseReviewSignalInput[],
): CloseReviewSignalInput[] {
  const seen = new Set<string>();
  const result: CloseReviewSignalInput[] = [];

  for (const signal of signals) {
    if (seen.has(signal.fingerprint)) continue;
    seen.add(signal.fingerprint);
    result.push(signal);
  }

  return result;
}
