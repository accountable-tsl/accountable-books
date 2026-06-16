import type { AccountingBasis } from '@accountable-books/contracts/schema';
import { accountingBasis } from '@accountable-books/contracts/schema';
import { z } from 'zod';

import {
  fiscalCalendarStatus,
  fiscalPeriodType,
} from '../fiscal-calendar/fiscal-calendar.types.js';

import type {
  FiscalCalendarStatus,
  FiscalPeriodType,
} from '../fiscal-calendar/fiscal-calendar.types.js';

const ymdDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const closeReadinessSection = z.enum([
  'period_sequence',
  'bank_data_completeness',
  'classification_review',
  'journals',
  'ledger_integrity',
  'suspense_clearing',
  'trial_balance_balances',
  'analytical_review',
  'final_approval',
  'cash_income',
  'cash_expenses',
  'owner_director_equity_movements',
  'taxes_paid',
  'payroll_paid',
  'off_bank_cash_confirmation',
  'liabilities_payables',
  'fixed_assets_depreciation',
  'tax_liabilities',
  'payroll_liabilities',
  'foreign_currency',
  'recurring_journals',
  'revenue_receivables',
  'expenses_payables',
  'accruals',
  'prepayments_deferred_costs',
  'deferred_revenue_customer_deposits',
  'payroll_and_liabilities',
  'taxes',
  'foreign_currency_fx_revaluation',
  'director_current_account_equity',
  'cutoff_unusual_movements',
]);
export type CloseReadinessSection = z.infer<typeof closeReadinessSection>;

export const closeReadinessSeverity = z.enum([
  'blocker',
  'required_review',
  'advisory',
  'final_confirmation',
]);
export type CloseReadinessSeverity = z.infer<typeof closeReadinessSeverity>;

export const closeReadinessFindingStatus = z.enum([
  'open',
  'resolved',
  'acknowledged',
  'not_applicable',
  'invalidated',
  'superseded',
]);
export type CloseReadinessFindingStatus = z.infer<
  typeof closeReadinessFindingStatus
>;

export const closeReadinessEvaluationState = z.enum([
  'preview',
  'active',
  'overdue',
  'closed',
  'locked',
]);
export type CloseReadinessEvaluationState = z.infer<
  typeof closeReadinessEvaluationState
>;

export const closeReadinessSurface = z.enum([
  'firm_portfolio',
  'assignee_work_queue',
  'company_workspace',
]);
export type CloseReadinessSurface = z.infer<typeof closeReadinessSurface>;

export const closeReadinessAudience = z.enum(['firm_managed', 'owner_managed']);
export type CloseReadinessAudience = z.infer<typeof closeReadinessAudience>;

export const closeReadinessRuleActivation = z.enum([
  'always',
  'when_configured',
  'when_pattern_detected',
  'future',
]);
export type CloseReadinessRuleActivation = z.infer<
  typeof closeReadinessRuleActivation
>;

export const closeReadinessRuleEvidence = z.enum([
  'objective',
  'configured_workflow',
  'inferred_pattern',
  'human_confirmation',
]);
export type CloseReadinessRuleEvidence = z.infer<
  typeof closeReadinessRuleEvidence
>;

type CloseReadinessRuleDefinition = {
  code: string;
  section: CloseReadinessSection;
  severity: CloseReadinessSeverity;
  title: string;
  description: string;
  accountingBases: readonly AccountingBasis[] | 'all';
  activation: CloseReadinessRuleActivation;
  evidence: CloseReadinessRuleEvidence;
};

const ALL_ACCOUNTING_BASES = [
  'modified_cash_basis',
  'modified_accrual_basis',
] as const satisfies readonly AccountingBasis[];

export const CLOSE_READINESS_RULES = [
  {
    code: 'period_prior_managed_month_open',
    section: 'period_sequence',
    severity: 'blocker',
    title: 'Prior managed month is still open',
    description:
      'The immediately preceding managed monthly period must be closed before this period can close. Periods before conversion or the first managed period do not block close.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'period_close_stale_due_to_prior_reopen',
    section: 'period_sequence',
    severity: 'blocker',
    title: 'Close is stale after prior period reopen',
    description:
      'This period was closed, but an earlier managed month was reopened after that close. Re-evaluate and re-confirm this period before annual close or lock.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'trial_balance_unbalanced',
    section: 'trial_balance_balances',
    severity: 'blocker',
    title: 'Trial balance is unbalanced',
    description:
      'Trial balance debits and credits do not match at accounting precision.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'gl_balances_stale_or_missing',
    section: 'trial_balance_balances',
    severity: 'blocker',
    title: 'GL balances are stale or missing',
    description:
      'Required GL balance materializations are missing or stale for accounts with relevant period activity.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'draft_journals_open',
    section: 'journals',
    severity: 'blocker',
    title: 'Draft journals remain open',
    description: 'Draft or unposted journals dated in the period remain open.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'bank_import_hard_gap',
    section: 'bank_data_completeness',
    severity: 'blocker',
    title: 'Bank import has a hard gap',
    description: 'A known bank feed or import gap exists in the period.',
    accountingBases: 'all',
    activation: 'when_configured',
    evidence: 'objective',
  },
  {
    code: 'uncategorized_transactions_open',
    section: 'classification_review',
    severity: 'blocker',
    title: 'Transactions remain uncategorized',
    description: 'Bank transactions in the period remain uncategorized.',
    accountingBases: 'all',
    activation: 'always',
    evidence: 'objective',
  },
  {
    code: 'required_categorization_reviews_open',
    section: 'classification_review',
    severity: 'blocker',
    title: 'Required categorization reviews remain open',
    description:
      'Required AI or human categorization reviews remain incomplete where review is required before posting or before close.',
    accountingBases: 'all',
    activation: 'when_configured',
    evidence: 'objective',
  },
  {
    code: 'client_classification_queries_open',
    section: 'classification_review',
    severity: 'blocker',
    title: 'Classification queries remain open',
    description:
      'Client or bookkeeper queries required to classify period transactions remain unresolved.',
    accountingBases: 'all',
    activation: 'when_configured',
    evidence: 'objective',
  },
  {
    code: 'bank_import_duplicate_exact',
    section: 'bank_data_completeness',
    severity: 'blocker',
    title: 'Exact duplicate bank import detected',
    description:
      'The same provider or import transaction identity appears more than once and indicates objective duplicate import corruption.',
    accountingBases: 'all',
    activation: 'when_configured',
    evidence: 'objective',
  },
  {
    code: 'bank_sync_stale_review',
    section: 'bank_data_completeness',
    severity: 'required_review',
    title: 'Bank sync may be stale',
    description:
      'Connected bank data is stale beyond the configured threshold for an active connected account. CSV/manual accounts and deliberately closed bank accounts should not trigger this by default.',
    accountingBases: 'all',
    activation: 'when_configured',
    evidence: 'objective',
  },
  {
    code: 'suspense_activity_review',
    section: 'suspense_clearing',
    severity: 'required_review',
    title: 'Suspense or fallback activity needs review',
    description:
      'Suspense, fallback, or uncategorized accounts have period activity or a closing balance that must be cleared or accepted with reason.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'bank_duplicate_possible_review',
    section: 'bank_data_completeness',
    severity: 'required_review',
    title: 'Possible duplicate bank transactions need review',
    description:
      'Transactions look like possible duplicates but are not objective duplicate imports.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_owner_director_equity_review',
    section: 'owner_director_equity_movements',
    severity: 'required_review',
    title: 'Owner or director movements need review',
    description:
      'Material owner, director, shareholder, drawings, contribution, or equity movement exists.',
    accountingBases: ['modified_cash_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_tax_payment_review',
    section: 'taxes_paid',
    severity: 'required_review',
    title: 'Tax payments need review',
    description:
      'Tax-like payments or tax accounts moved in a way worth reviewing before close.',
    accountingBases: ['modified_cash_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_payroll_payment_review',
    section: 'payroll_paid',
    severity: 'required_review',
    title: 'Payroll payments need review',
    description: 'Payroll-like payments exist in the period.',
    accountingBases: ['modified_cash_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_fixed_asset_or_liability_pattern_review',
    section: 'fixed_assets_depreciation',
    severity: 'required_review',
    title: 'Asset or liability usage needs review',
    description:
      'A modified cash company used fixed asset, depreciation, liability, or payable accounts during the period.',
    accountingBases: ['modified_cash_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_foreign_currency_review',
    section: 'foreign_currency',
    severity: 'required_review',
    title: 'Foreign currency activity needs review',
    description: 'Foreign currency balances or FX-like settlements exist.',
    accountingBases: ['modified_cash_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'cash_off_bank_activity_confirmed',
    section: 'off_bank_cash_confirmation',
    severity: 'final_confirmation',
    title: 'Confirm off-bank activity',
    description:
      'Confirm that no material off-bank transactions need to be recorded.',
    accountingBases: ['modified_cash_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
  {
    code: 'cash_reports_ready_confirmed',
    section: 'final_approval',
    severity: 'final_confirmation',
    title: 'Confirm reports are ready',
    description: 'Confirm that the period reports are accepted for close.',
    accountingBases: ['modified_cash_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
  {
    code: 'recurring_journal_missing_required',
    section: 'recurring_journals',
    severity: 'blocker',
    title: 'Required recurring journal is missing',
    description:
      'A configured required recurring journal failed to generate or post.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_configured',
    evidence: 'configured_workflow',
  },
  {
    code: 'expected_accrual_reversal_missing',
    section: 'accruals',
    severity: 'blocker',
    title: 'Expected accrual reversal is missing',
    description:
      'A system-known expected accrual reversal is missing or failed. This only applies when the original accrual carried reversal metadata or was generated by a tracked workflow.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_configured',
    evidence: 'configured_workflow',
  },
  {
    code: 'configured_depreciation_missing',
    section: 'fixed_assets_depreciation',
    severity: 'blocker',
    title: 'Configured depreciation is missing',
    description: 'Configured depreciation or amortization did not post.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_configured',
    evidence: 'configured_workflow',
  },
  {
    code: 'configured_fx_revaluation_missing',
    section: 'foreign_currency_fx_revaluation',
    severity: 'blocker',
    title: 'Configured FX revaluation is missing',
    description:
      'Configured FX revaluation is missing or stale where monetary FX balances exist.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_configured',
    evidence: 'configured_workflow',
  },
  {
    code: 'configured_payroll_accrual_missing',
    section: 'payroll_and_liabilities',
    severity: 'blocker',
    title: 'Configured payroll accrual is missing',
    description: 'Configured payroll accrual workflow is incomplete.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_configured',
    evidence: 'configured_workflow',
  },
  {
    code: 'subledger_gl_control_mismatch',
    section: 'ledger_integrity',
    severity: 'blocker',
    title: 'Subledger control does not match GL',
    description:
      'Dormant for V1. Evaluate only after true AR/AP subledgers exist and are enabled. Locked receivable/payable COA accounts are not subledgers.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'future',
    evidence: 'configured_workflow',
  },
  {
    code: 'revenue_variance_review',
    section: 'revenue_receivables',
    severity: 'required_review',
    title: 'Revenue variance needs review',
    description:
      'Revenue movement is materially unusual versus recent periods.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'bank_receipt_direct_to_revenue_review',
    section: 'revenue_receivables',
    severity: 'required_review',
    title: 'Bank receipt posted directly to revenue',
    description:
      'Bank receipts were posted directly to revenue where receivables or deferred revenue treatment may be expected.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'customer_deposit_deferred_revenue_review',
    section: 'deferred_revenue_customer_deposits',
    severity: 'required_review',
    title: 'Customer deposit treatment needs review',
    description:
      'Customer deposits or prepayments may need deferred revenue treatment.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'supplier_payment_direct_to_expense_review',
    section: 'expenses_payables',
    severity: 'required_review',
    title: 'Supplier payment posted directly to expense',
    description:
      'Supplier payments were posted directly to expense where payables or accrual treatment may be expected.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'recurring_expense_missing_review',
    section: 'expenses_payables',
    severity: 'required_review',
    title: 'Recurring expense may be missing',
    description: 'A normally recurring expense appears missing.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'accrual_candidate_review',
    section: 'accruals',
    severity: 'required_review',
    title: 'Accrual candidate needs review',
    description:
      'Material expense or revenue pattern suggests an accrual may be needed.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'prepayment_candidate_review',
    section: 'prepayments_deferred_costs',
    severity: 'required_review',
    title: 'Prepayment candidate needs review',
    description:
      'Annual, quarterly, or multi-period spend may need prepaid or deferred treatment.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'fixed_asset_depreciation_review',
    section: 'fixed_assets_depreciation',
    severity: 'required_review',
    title: 'Fixed asset depreciation needs review',
    description:
      'Fixed asset activity exists without a clear depreciation or amortization review.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'payroll_liability_review',
    section: 'payroll_and_liabilities',
    severity: 'required_review',
    title: 'Payroll liability treatment needs review',
    description:
      'Payroll payments or expense activity may need liability or tax review.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'tax_liability_movement_review',
    section: 'taxes',
    severity: 'required_review',
    title: 'Tax liability movement needs review',
    description:
      'Tax liability or payment movement is unusual or potentially misclassified.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'fx_revaluation_decision_review',
    section: 'foreign_currency_fx_revaluation',
    severity: 'required_review',
    title: 'FX revaluation decision needs review',
    description:
      'FX balances exist but no configured revaluation workflow applies.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'director_current_account_review',
    section: 'director_current_account_equity',
    severity: 'required_review',
    title: 'Director current account needs review',
    description: 'Director/current-account/equity movement needs review.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'large_unusual_movement_review',
    section: 'analytical_review',
    severity: 'required_review',
    title: 'Large unusual movement needs review',
    description:
      'Account movement is materially unusual by the configured threshold.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    // Catalog homes for surfaced per-transaction signals (close_review_signals).
    // These rules give each rollup finding a single source of title/severity/
    // section; `mergeOpenSignalFindings` emits them via `buildFinding`.
    code: 'bank_offset_to_non_cash_account_review',
    section: 'ledger_integrity',
    severity: 'required_review',
    title: 'Bank movement posted to a non-cash account',
    description:
      'A bank/cash movement was offset directly to depreciation, accumulated depreciation, or equity, which is almost always a miscategorization that needs review.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'receivable_payable_missing_counterparty_review',
    section: 'ledger_integrity',
    severity: 'required_review',
    title: 'Receivable or payable posting is missing a counterparty',
    description:
      'A posting to a receivable, payable, related-party, prepayment, or deferred account has no contact, so the counterparty balance cannot be tracked.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'missing_supporting_document_review',
    section: 'ledger_integrity',
    severity: 'required_review',
    title: 'Manual journal is missing a supporting document',
    description:
      'A manual journal touching a counterparty account has no attached supporting document.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'journal_posted_to_bank_account_review',
    section: 'ledger_integrity',
    severity: 'required_review',
    title: 'Manual journal moved a bank account directly',
    description:
      'A manual journal posted to a bank or cash-equivalent account directly, which usually belongs in a bank-feed or transfer flow.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'accumulated_depreciation_unexpected_movement_review',
    section: 'fixed_assets_depreciation',
    severity: 'required_review',
    title: 'Accumulated depreciation moved without a matching pair',
    description:
      'A journal touched accumulated depreciation but paired with neither depreciation expense nor a fixed asset, suggesting a miscategorized movement.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'first_time_account_use',
    section: 'analytical_review',
    severity: 'advisory',
    title: 'Account used for the first time',
    description: 'An account was used for the first time.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'objective',
  },
  {
    code: 'bank_duplicate_possible',
    section: 'bank_data_completeness',
    severity: 'advisory',
    title: 'Possible duplicate bank transaction',
    description:
      'Low or medium-confidence possible duplicate transaction exists.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'negative_balance_unusual',
    section: 'analytical_review',
    severity: 'advisory',
    title: 'Unusual negative balance',
    description: 'An account has an unusual negative balance for its type.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'new_vendor_customer_pattern',
    section: 'analytical_review',
    severity: 'advisory',
    title: 'New counterparty pattern',
    description: 'New counterparty or activity pattern may deserve review.',
    accountingBases: 'all',
    activation: 'when_pattern_detected',
    evidence: 'inferred_pattern',
  },
  {
    code: 'accrual_revenue_complete_confirmed',
    section: 'revenue_receivables',
    severity: 'final_confirmation',
    title: 'Confirm revenue completeness',
    description:
      'Confirm that all material revenue for the period has been considered.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
  {
    code: 'accrual_expenses_liabilities_complete_confirmed',
    section: 'expenses_payables',
    severity: 'final_confirmation',
    title: 'Confirm expenses and liabilities completeness',
    description:
      'Confirm that all material expenses and liabilities for the period have been considered.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
  {
    code: 'external_documents_considered_confirmed',
    section: 'final_approval',
    severity: 'final_confirmation',
    title: 'Confirm external documents were considered',
    description:
      'Confirm that external invoices, bills, or documents not captured in the app have been considered.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
  {
    code: 'accrual_reports_ready_confirmed',
    section: 'final_approval',
    severity: 'final_confirmation',
    title: 'Confirm reports are ready',
    description: 'Confirm that the period reports are accepted for close.',
    accountingBases: ['modified_accrual_basis'],
    activation: 'always',
    evidence: 'human_confirmation',
  },
] as const satisfies readonly CloseReadinessRuleDefinition[];

export type CloseReadinessRuleDefinitionItem =
  (typeof CLOSE_READINESS_RULES)[number];
export type CloseReadinessFindingCode =
  CloseReadinessRuleDefinitionItem['code'];

export const CLOSE_READINESS_FINDING_CODES = CLOSE_READINESS_RULES.map(
  (rule) => rule.code,
) as [CloseReadinessFindingCode, ...CloseReadinessFindingCode[]];

export const closeReadinessFindingCode = z.enum(CLOSE_READINESS_FINDING_CODES);

export const CLOSE_READINESS_STATE_GATE_CODES = [
  'period_not_ended_company_timezone',
] as const;
export type CloseReadinessStateGateCode =
  (typeof CLOSE_READINESS_STATE_GATE_CODES)[number];

export const closeReadinessStateGateCode = z.enum(
  CLOSE_READINESS_STATE_GATE_CODES,
);

export const CLOSE_READINESS_TASK_BLOCKER_SEVERITY = {
  blocker: 'hard',
  required_review: 'warning',
} as const satisfies Partial<
  Record<CloseReadinessSeverity, 'hard' | 'warning'>
>;

export const CLOSE_READINESS_BLOCKING_SEVERITIES = [
  'blocker',
  'required_review',
  'final_confirmation',
] as const satisfies readonly CloseReadinessSeverity[];

export const CLOSE_READINESS_RULES_BY_CODE = new Map(
  CLOSE_READINESS_RULES.map((rule) => [rule.code, rule]),
);

/**
 * Build a UI-facing finding from a catalog code. The single source of a
 * finding's section/severity/title/description — used by both the live
 * evaluator and the signal-rollup merge so there is no second catalog.
 */
export function buildCloseReadinessFinding(
  code: CloseReadinessFindingCode,
  {
    details = {},
    relatedCoaIds = [],
    relatedAccountTypeKeys = [],
    relatedAccountElementKeys = [],
    acknowledgement,
  }: {
    details?: Record<string, unknown>;
    relatedCoaIds?: string[];
    relatedAccountTypeKeys?: string[];
    relatedAccountElementKeys?: string[];
    acknowledgement?: CloseReadinessAcknowledgement;
  } = {},
): CloseReadinessFinding {
  const rule = CLOSE_READINESS_RULES_BY_CODE.get(code);
  if (!rule) throw new Error(`Unknown close readiness rule: ${code}`);

  return {
    code,
    section: rule.section,
    severity: rule.severity,
    title: rule.title,
    description: rule.description,
    details,
    relatedCoaIds,
    relatedAccountTypeKeys,
    relatedAccountElementKeys,
    ...(acknowledgement ? { acknowledgement } : {}),
  };
}

export function getCloseReadinessRulesForAccountingBasis(
  basis: AccountingBasis,
): CloseReadinessRuleDefinitionItem[] {
  accountingBasis.parse(basis);

  return CLOSE_READINESS_RULES.filter((rule) => {
    if (rule.accountingBases === 'all') return true;

    const ruleBases: readonly AccountingBasis[] = rule.accountingBases;
    return ruleBases.includes(basis);
  });
}

export const closeReadinessAcknowledgementScope = z.enum([
  'ledger_transaction_signal',
  'period_finding',
]);
export type CloseReadinessAcknowledgementScope = z.infer<
  typeof closeReadinessAcknowledgementScope
>;

/**
 * Present only on decision-eligible findings (the signal rollups). Carries the
 * identity a client posts back to acknowledge/dismiss the finding: the stable
 * `fingerprint` and the current `factsHash`. Objective blockers (e.g. an
 * unbalanced trial balance) are NOT acknowledgeable — you fix them — so they
 * carry no acknowledgement descriptor.
 */
export const closeReadinessAcknowledgement = z.object({
  scope: closeReadinessAcknowledgementScope,
  fingerprint: z.string().min(1),
  factsHash: z.string().min(1),
});
export type CloseReadinessAcknowledgement = z.infer<
  typeof closeReadinessAcknowledgement
>;

export const closeReadinessFinding = z.object({
  code: closeReadinessFindingCode,
  section: closeReadinessSection,
  severity: closeReadinessSeverity,
  title: z.string().min(1),
  description: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
  sourceTable: z.string().min(1).optional(),
  sourceEntityId: z.uuid().optional(),
  relatedCoaIds: z.array(z.uuid()).default([]),
  relatedAccountTypeKeys: z.array(z.string().min(1)).default([]),
  relatedAccountElementKeys: z.array(z.string().min(1)).default([]),
  acknowledgement: closeReadinessAcknowledgement.optional(),
});
export type CloseReadinessFinding = z.infer<typeof closeReadinessFinding>;

export const closeReadinessPeriod = z.object({
  fiscalYear: z.number().int().min(1900).max(9999),
  periodNumber: z.number().int().min(1),
  periodType: fiscalPeriodType,
  startDate: ymdDate,
  endDate: ymdDate,
  status: fiscalCalendarStatus,
});
export type CloseReadinessPeriod = z.infer<typeof closeReadinessPeriod>;

export const closeReadinessSummary = z.object({
  blockerCount: z.number().int().nonnegative(),
  requiredReviewCount: z.number().int().nonnegative(),
  advisoryCount: z.number().int().nonnegative(),
  finalConfirmationCount: z.number().int().nonnegative(),
});
export type CloseReadinessSummary = z.infer<typeof closeReadinessSummary>;

export const closeReadinessEvaluation = z.object({
  companyId: z.uuid(),
  firmCompanyId: z.uuid().nullable(),
  workflowRunId: z.uuid().nullable(),
  accountingBasis,
  timezone: z.string().min(1),
  evaluatedAt: z.string().datetime(),
  state: closeReadinessEvaluationState,
  formalCloseAllowed: z.boolean(),
  stateGateCodes: z.array(closeReadinessStateGateCode).default([]),
  surfaces: z.array(closeReadinessSurface).default([]),
  audience: closeReadinessAudience,
  period: closeReadinessPeriod,
  findings: z.array(closeReadinessFinding),
  summary: closeReadinessSummary,
});
export type CloseReadinessEvaluation = z.infer<typeof closeReadinessEvaluation>;

export type CloseReadinessPeriodInput = {
  fiscalYear: number;
  periodNumber: number;
  periodType?: FiscalPeriodType;
};

export type CloseReadinessValidationResult = {
  passed: boolean;
  blockerCodes: CloseReadinessFindingCode[];
  requiredReviewCodes: CloseReadinessFindingCode[];
  finalConfirmationCodes: CloseReadinessFindingCode[];
  errors: string[];
  warnings: string[];
};

export type CloseReadinessActivationContext = {
  companyId: string;
  timezone: string;
  periodEndDate: string;
  now: Date;
  fiscalStatus: FiscalCalendarStatus;
};

export { ALL_ACCOUNTING_BASES as CLOSE_READINESS_ACCOUNTING_BASES };
