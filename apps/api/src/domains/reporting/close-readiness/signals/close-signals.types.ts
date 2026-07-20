import type { AccountingBasis } from '@accountable-books/contracts/schema';
import { z } from 'zod';

import type { AccountElementKey } from '../../../../bootstrap/catalogs/accounting/account-elements.js';
import type { AccountTypeLabelRole } from '../../../../bootstrap/catalogs/accounting/account-types.js';
import type { Fingerprint } from '../../../../shared/utils/crypto.utils.js';
import type { FiscalPeriodType } from '../../fiscal-calendar/fiscal-calendar.types.js';
import type { CloseReadinessFindingCode } from '../close-readiness.types.js';

/**
 * Per-transaction close review signal codes.
 *
 * Signals are durable, stateless accounting-judgment facts about a single
 * posted ledger transaction. They are generated after a ledger write and
 * consumed by close readiness. They are NOT the live objective blockers (trial
 * balance, uncategorized, prior period open) — those stay recompute-only.
 *
 * Organized into families:
 *
 * - Universal wrong-destination (basis-agnostic): a destination that is wrong
 *   for any business — `bank_offset_to_non_cash_account`,
 *   `posted_to_fallback_account`, `journal_to_bank_account`.
 * - Accrual treatment bypass (modified accrual only): routing around the accrual
 *   accounts — `bank_offset_direct_to_revenue`, `bank_offset_direct_to_expense`.
 * - Metadata completeness (any source): a posting to an account that requires a
 *   counterparty/document but is missing it — `posting_missing_required_contact`,
 *   `posting_missing_supporting_doc`.
 * - Journal integrity (manual journal only): `journal_to_bank_account`,
 *   `journal_depreciation_pairing_mismatch`.
 * - Period-finding inputs (never surfaced raw): `monetary_fx_leg` feeds the FX
 *   revaluation finding; `bank_offset_to_capex` feeds the fixed-asset
 *   depreciation finding. Both are evaluated per transaction but only matter as
 *   cross-account/cross-period context.
 *
 * `low_confidence_autopost` was intentionally dropped for V1: unreviewed ML
 * autoposts are already covered as a live blocker by
 * `required_categorization_reviews_open`, so a per-transaction signal here would
 * only double-count the same concern.
 *
 * Contextual checks that need cross-account or cross-period state (tax expense
 * vs open tax liability, payroll without a payroll-liability movement, loan
 * repayment not split) are NOT signals — they are period-level findings.
 */
export const CLOSE_REVIEW_SIGNAL_CODES = [
  'bank_offset_to_non_cash_account',
  'bank_offset_direct_to_revenue',
  'bank_offset_direct_to_expense',
  'bank_offset_to_capex',
  'posted_to_fallback_account',
  'monetary_fx_leg',
  'posting_missing_required_contact',
  'posting_missing_supporting_doc',
  'journal_to_bank_account',
  'journal_depreciation_pairing_mismatch',
] as const;

export type CloseReviewSignalCode = (typeof CLOSE_REVIEW_SIGNAL_CODES)[number];

export const closeReviewSignalCode = z.enum(CLOSE_REVIEW_SIGNAL_CODES);

/**
 * Whether a signal is shown to users as its own rollup finding, or only consumed
 * internally by a period-level check.
 *
 * - `finding`: surfaced at close as a rollup acknowledgement unit.
 * - `period_finding_input`: never shown raw; feeds a Phase 5 period-level check
 *   (e.g. `monetary_fx_leg` feeds the FX revaluation finding).
 */
export type CloseReviewSignalRole = 'finding' | 'period_finding_input';

export type CloseReviewSignalMetadata = {
  /** Whether `mergeOpenSignalFindings` surfaces this signal as a finding. */
  surfaced: boolean;
  /** The catalog finding code this signal rolls up into (single source of
   * title/severity/section). */
  rollupFindingCode: CloseReadinessFindingCode;
  role: CloseReviewSignalRole;
};

/**
 * Maps every signal code to its surfaced/internal classification and its single
 * catalog home. `mergeOpenSignalFindings` filters to `surfaced === true` and
 * emits through `buildFinding(rollupFindingCode, …)` so there is no second
 * presentation catalog.
 */
export const CLOSE_REVIEW_SIGNAL_METADATA: Record<
  CloseReviewSignalCode,
  CloseReviewSignalMetadata
> = {
  bank_offset_to_non_cash_account: {
    surfaced: true,
    rollupFindingCode: 'bank_offset_to_non_cash_account_review',
    role: 'finding',
  },
  bank_offset_direct_to_revenue: {
    surfaced: true,
    rollupFindingCode: 'bank_receipt_direct_to_revenue_review',
    role: 'finding',
  },
  bank_offset_direct_to_expense: {
    surfaced: true,
    rollupFindingCode: 'supplier_payment_direct_to_expense_review',
    role: 'finding',
  },
  // Never surfaced raw: a bank payment landing on a fixed asset is normal
  // (buying equipment debits PPE, credits bank). The review-worthy fact is
  // capex *without* a matching depreciation movement, which is cross-account and
  // cross-period — so this feeds the Phase 5 `fixed_asset_depreciation_review`
  // period check rather than firing per transaction (which would flag every
  // legitimate asset purchase and double-count the live check).
  bank_offset_to_capex: {
    surfaced: false,
    rollupFindingCode: 'fixed_asset_depreciation_review',
    role: 'period_finding_input',
  },
  posted_to_fallback_account: {
    surfaced: true,
    rollupFindingCode: 'suspense_activity_review',
    role: 'finding',
  },
  // Never surfaced raw: the Phase 5 FX revaluation check consumes these legs.
  monetary_fx_leg: {
    surfaced: false,
    rollupFindingCode: 'fx_revaluation_decision_review',
    role: 'period_finding_input',
  },
  posting_missing_required_contact: {
    surfaced: true,
    rollupFindingCode: 'receivable_payable_missing_counterparty_review',
    role: 'finding',
  },
  posting_missing_supporting_doc: {
    surfaced: true,
    rollupFindingCode: 'missing_supporting_document_review',
    role: 'finding',
  },
  journal_to_bank_account: {
    surfaced: true,
    rollupFindingCode: 'journal_posted_to_bank_account_review',
    role: 'finding',
  },
  journal_depreciation_pairing_mismatch: {
    surfaced: true,
    rollupFindingCode: 'accumulated_depreciation_unexpected_movement_review',
    role: 'finding',
  },
};

/** Signal codes that surface as their own rollup finding at close. */
export const SURFACED_CLOSE_REVIEW_SIGNAL_CODES =
  CLOSE_REVIEW_SIGNAL_CODES.filter(
    (code) => CLOSE_REVIEW_SIGNAL_METADATA[code].surfaced,
  );

/**
 * Mirrors the `txn_categorization_source` DB enum. Kept as a local literal so
 * the pure evaluator has no dependency on persistence types; the Phase 3 loader
 * maps the DB value into this.
 */
export type LedgerCategorizationSource =
  | 'rule'
  | 'ml'
  | 'ml_heuristic'
  | 'manual';

/** Mirrors the `transaction_source` check constraint on `ledger_transactions`. */
export type LedgerTransactionSource = 'manual_journal' | 'bank_transaction';

/**
 * One ledger entry as the signal evaluator needs to see it. Deliberately
 * decoupled from the DB row shape so the evaluator stays pure and unit-testable
 * without a database. `contactId` is the effective counterparty for the leg
 * (the Phase 3 loader resolves entry contact, falling back to the transaction
 * contact).
 */
export type SignalLedgerEntry = {
  ledgerEntryId: string;
  coaId: string;
  accountTypeKey: string;
  accountElementKey: AccountElementKey;
  labelRole: AccountTypeLabelRole;
  isBankLeg: boolean;
  isMonetary: boolean;
  humanReviewed: boolean;
  contactId: string | null;
  amount: number;
};

/**
 * One ledger transaction header as the signal evaluator needs to see it.
 * `hasSupportingDocument` is supplied by the loader from attachment records
 * (`objects` / file uploads) so the evaluator stays pure.
 */
export type SignalLedgerTransaction = {
  ledgerTransactionId: string;
  companyId: string;
  fiscalCalendarId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
  transactionSource: LedgerTransactionSource;
  categorizationSource: LedgerCategorizationSource | null;
  hasSupportingDocument: boolean;
};

export type SignalEvaluationContext = {
  accountingBasis: AccountingBasis;
  /**
   * Optional minimum amount for `bank_offset_direct_to_expense`. Left undefined
   * by default — materiality is currency/scale dependent and is better applied
   * by the surfacing/period layer in reporting currency.
   */
  directExpenseMinAmount?: number;
};

/**
 * The stateless fact emitted by the evaluator and (in Phase 3) persisted to
 * `close_review_signals`. `fingerprint` is stable identity; `factsHash`
 * captures the material facts so an acknowledgement can be invalidated when
 * they change.
 */
export type CloseReviewSignalInput = {
  code: CloseReviewSignalCode;
  ledgerTransactionId: string;
  ledgerEntryId: string | null;
  coaId: string | null;
  accountTypeKey: string | null;
  accountElementKey: AccountElementKey | null;
  amount: number | null;
  fingerprint: Fingerprint;
  factsHash: Fingerprint;
  details: Record<string, unknown>;
};
