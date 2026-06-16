import type { AccountingBasis } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';
import { formatInTimeZone } from 'date-fns-tz';

import { knexClient as db } from '../../../db/knexClient.js';
import { addDaysToYMD, toYMD } from '../../../shared/utils/date.utils.js';
import { getTrialBalance } from '../../balances/balances.model.js';
import { getCompanyCloseReadinessContext } from '../../companies/companies.utils.js';
import {
  getFiscalPeriodBySelector,
  getPreviousFiscalPeriod,
} from '../fiscal-calendar/fiscal-calendar.service.js';
import { getAccountActivity, type AccountActivityRow } from './account-activity.js';
import {
  buildCloseReadinessFinding as buildFinding,
  closeReadinessEvaluation,
} from './close-readiness.types.js';
import { mergeOpenSignalFindings } from './open-signal-findings.js';
import { evaluatePeriodFindings } from './period-findings.js';

import type { AccountElementKey } from '../../../bootstrap/catalogs/accounting/account-elements.js';
import type { CompanyCloseReadinessContext } from '../../companies/companies.utils.js';
import type {
  FiscalCalendar,
  FiscalPeriodType,
} from '../fiscal-calendar/fiscal-calendar.types.js';
import type {
  CloseReadinessAudience,
  CloseReadinessEvaluation,
  CloseReadinessEvaluationState,
  CloseReadinessFinding,
  CloseReadinessPeriodInput,
  CloseReadinessStateGateCode,
  CloseReadinessSurface,
} from './close-readiness.types.js';

type EvaluateCloseReadinessParams = {
  companyId: string;
  period: CloseReadinessPeriodInput;
  now?: Date;
  trx?: Knex.Transaction;
};

type CountRow = {
  count: string | number;
};

type OpenCategorizationReviewRow = {
  coa_id: string;
};

type TrialBalanceData = NonNullable<
  Awaited<ReturnType<typeof getTrialBalance>>['data']
>;

const DEFAULT_TARGET_CLOSE_DAYS = 5;
const MODIFIED_CASH_REVIEW_ELEMENT_KEYS = new Set<AccountElementKey>([
  'non_current_asset',
  'contra_asset',
  'current_liabilities',
  'non_current_liabilities',
  'contra_liabilities',
]);

export async function evaluateCloseReadiness({
  companyId,
  period,
  now = new Date(),
  trx,
}: EvaluateCloseReadinessParams): Promise<CloseReadinessEvaluation> {
  const queryable = trx ?? db;
  const periodType = period.periodType ?? 'monthly';

  const company = await getCompanyCloseReadinessContext(companyId, queryable);
  const fiscalPeriod = await getFiscalPeriodBySelector({
    companyId,
    fiscalYear: period.fiscalYear,
    periodNumber: period.periodNumber,
    periodType,
    trx,
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  if (!fiscalPeriod) {
    throw new Error(
      `Fiscal period not found: ${period.fiscalYear}-${period.periodNumber}-${periodType}`,
    );
  }

  const startDate = toYMD(fiscalPeriod.start_date);
  const endDate = toYMD(fiscalPeriod.end_date);
  const timezone = company.default_timezone || 'Etc/UTC';
  const localToday = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const stateGateCodes: CloseReadinessStateGateCode[] = [];
  const state = getEvaluationState({
    fiscalStatus: fiscalPeriod.status,
    endDate,
    localToday,
  });

  if (state === 'preview') {
    stateGateCodes.push('period_not_ended_company_timezone');
  }

  const findings: CloseReadinessFinding[] = [];

  findings.push(
    ...(await evaluatePeriodSequence({
      company,
      period: fiscalPeriod,
      startDate,
      trx,
    })),
  );

  if (fiscalPeriod.status === 'open') {
    const trialBalanceFindings = await evaluateTrialBalanceReadiness({
      companyId: company.id,
      fiscalYear: fiscalPeriod.fiscal_year,
      periodNumber: fiscalPeriod.period_number,
      periodType: fiscalPeriod.period_type,
      trx,
    });
    const accountActivity = await getAccountActivity({
      queryable,
      companyId: company.id,
      startDate,
      endDate,
    });

    findings.push(...trialBalanceFindings);
    findings.push(
      ...(await evaluateOpenPeriodBlockers({
        queryable,
        companyId: company.id,
        startDate,
        endDate,
      })),
    );
    findings.push(
      ...evaluateAccountActivityReviews({
        accountingBasis: company.accounting_basis,
        accountActivity,
      }),
    );
    findings.push(
      ...(await mergeOpenSignalFindings({
        queryable,
        companyId: company.id,
        fiscalYear: fiscalPeriod.fiscal_year,
        periodNumber: fiscalPeriod.period_number,
        periodType: fiscalPeriod.period_type,
      })),
    );
    findings.push(
      ...(await evaluatePeriodFindings({
        queryable,
        accountingBasis: company.accounting_basis,
        period: {
          companyId: company.id,
          fiscalYear: fiscalPeriod.fiscal_year,
          periodNumber: fiscalPeriod.period_number,
          periodType: fiscalPeriod.period_type,
        },
        startDate,
        endDate,
        accountActivity,
      })),
    );

    if (state !== 'preview') {
      findings.push(...evaluateFinalConfirmations(company.accounting_basis));
    }
  }

  const evaluation: CloseReadinessEvaluation = {
    companyId: company.id,
    firmCompanyId: company.assigned_firm_id,
    workflowRunId: null,
    accountingBasis: company.accounting_basis,
    timezone,
    evaluatedAt: now.toISOString(),
    state,
    formalCloseAllowed: fiscalPeriod.status === 'open' && state !== 'preview',
    stateGateCodes,
    surfaces: getSurfaces(company),
    audience: getAudience(company),
    period: {
      fiscalYear: fiscalPeriod.fiscal_year,
      periodNumber: fiscalPeriod.period_number,
      periodType: fiscalPeriod.period_type,
      startDate,
      endDate,
      status: fiscalPeriod.status,
    },
    findings,
    summary: summarizeFindings(findings),
  };

  return closeReadinessEvaluation.parse(evaluation);
}

function getEvaluationState({
  fiscalStatus,
  endDate,
  localToday,
}: {
  fiscalStatus: FiscalCalendar['status'];
  endDate: string;
  localToday: string;
}): CloseReadinessEvaluationState {
  if (fiscalStatus === 'locked') return 'locked';
  if (fiscalStatus === 'closed') return 'closed';
  if (localToday <= endDate) return 'preview';

  const targetCloseDate = addDaysToYMD(endDate, DEFAULT_TARGET_CLOSE_DAYS);
  return localToday > targetCloseDate ? 'overdue' : 'active';
}

async function evaluatePeriodSequence({
  company,
  period,
  startDate,
  trx,
}: {
  company: CompanyCloseReadinessContext;
  period: FiscalCalendar;
  startDate: string;
  trx?: Knex.Transaction;
}): Promise<CloseReadinessFinding[]> {
  const findings: CloseReadinessFinding[] = [];

  if (period.period_type === 'monthly') {
    const prior = await getPreviousFiscalPeriod({
      companyId: company.id,
      beforeStartYMD: startDate,
      periodType: 'monthly',
      trx,
    });

    if (
      prior &&
      isManagedPriorPeriod(company, prior) &&
      prior.status === 'open'
    ) {
      findings.push(
        buildFinding('period_prior_managed_month_open', {
          details: { priorPeriodEndDate: toYMD(prior.end_date) },
        }),
      );
    }
  }

  if (period.metadata?.close_stale_due_to_prior_reopen === true) {
    findings.push(
      buildFinding('period_close_stale_due_to_prior_reopen', {
        details: { metadata: period.metadata },
      }),
    );
  }

  return findings;
}

function isManagedPriorPeriod(
  company: CompanyCloseReadinessContext,
  prior: Pick<FiscalCalendar, 'end_date'>,
): boolean {
  if (!company.conversion_date) return true;

  return toYMD(prior.end_date) >= toYMD(company.conversion_date);
}

async function evaluateTrialBalanceReadiness({
  companyId,
  fiscalYear,
  periodNumber,
  periodType,
  trx,
}: {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
  trx?: Knex.Transaction;
}): Promise<CloseReadinessFinding[]> {
  const trialBalance = await getTrialBalance({
    companyId,
    fiscalYear,
    periodNumber,
    periodType,
    includeZeroBalances: false,
    trx,
  });

  if (!trialBalance.success || !trialBalance.data) {
    return [
      buildFinding('gl_balances_stale_or_missing', {
        details: {
          trialBalanceAvailable: false,
          message: trialBalance.message,
        },
      }),
    ];
  }

  return [
    ...evaluateTrialBalanceChecks(trialBalance.data),
    ...evaluateTrialBalanceFreshness(trialBalance.data),
  ];
}

function evaluateTrialBalanceChecks(
  trialBalance: TrialBalanceData,
): CloseReadinessFinding[] {
  const { opening, movement, closing } = trialBalance.checks;

  if (opening.balanced && movement.balanced && closing.balanced) return [];

  return [
    buildFinding('trial_balance_unbalanced', {
      details: {
        openingBalanced: opening.balanced,
        openingDifference: opening.difference,
        movementBalanced: movement.balanced,
        movementDifference: movement.difference,
        closingBalanced: closing.balanced,
        closingDifference: closing.difference,
      },
    }),
  ];
}

function evaluateTrialBalanceFreshness(
  trialBalance: TrialBalanceData,
): CloseReadinessFinding[] {
  if (trialBalance.freshness.status === 'fresh') return [];

  const relatedCoaIds = uniqueValues([
    ...trialBalance.freshness.missingCoaIds,
    ...trialBalance.freshness.staleCoaIds,
  ]);

  return [
    buildFinding('gl_balances_stale_or_missing', {
      details: {
        freshnessStatus: trialBalance.freshness.status,
        missingCoaCount: trialBalance.freshness.missingCoaIds.length,
        staleCoaCount: trialBalance.freshness.staleCoaIds.length,
        calculatedAtMin: trialBalance.freshness.calculatedAtMin,
        calculatedAtMax: trialBalance.freshness.calculatedAtMax,
      },
      relatedCoaIds,
    }),
  ];
}

async function evaluateOpenPeriodBlockers({
  queryable,
  companyId,
  endDate,
  startDate,
}: {
  queryable: Knex;
  companyId: string;
  startDate: string;
  endDate: string;
}): Promise<CloseReadinessFinding[]> {
  const findings: CloseReadinessFinding[] = [];

  const draftJournalCount = await countDraftJournalEntries(
    queryable,
    companyId,
    startDate,
    endDate,
  );
  const uncategorizedCount = await countUncategorizedTransactions(
    queryable,
    companyId,
    startDate,
    endDate,
  );
  const categorizationReview = await getOpenCategorizationReview(queryable, {
    companyId,
    startDate,
    endDate,
  });

  if (draftJournalCount > 0) {
    findings.push(
      buildFinding('draft_journals_open', {
        details: { count: draftJournalCount },
      }),
    );
  }

  if (uncategorizedCount > 0) {
    findings.push(
      buildFinding('uncategorized_transactions_open', {
        details: { count: uncategorizedCount },
      }),
    );
  }

  if (categorizationReview.unreviewedEntryCount > 0) {
    findings.push(
      buildFinding('required_categorization_reviews_open', {
        details: {
          unreviewedEntryCount: categorizationReview.unreviewedEntryCount,
        },
        relatedCoaIds: categorizationReview.relatedCoaIds,
      }),
    );
  }

  return findings;
}

async function getOpenCategorizationReview(
  queryable: Knex,
  {
    companyId,
    startDate,
    endDate,
  }: {
    companyId: string;
    startDate: string;
    endDate: string;
  },
): Promise<{ unreviewedEntryCount: number; relatedCoaIds: string[] }> {
  const rows = await queryable('ledger_entries as le')
    .join('ledger_transactions as lt', function () {
      this.on('lt.id', 'le.ledger_transaction_id').andOn(
        'lt.company_id',
        'le.company_id',
      );
    })
    .where('le.company_id', companyId)
    .where('lt.status', 'posted')
    .where('lt.transaction_source', 'bank_transaction')
    .whereIn('lt.categorization_source', ['rule', 'ml', 'ml_heuristic'])
    .where('le.human_reviewed', false)
    .whereBetween('le.fs_date', [startDate, endDate])
    .select<OpenCategorizationReviewRow[]>('le.coa_id');

  return {
    unreviewedEntryCount: rows.length,
    relatedCoaIds: uniqueValues(rows.map((row) => row.coa_id)),
  };
}

/**
 * Live, recompute-only account-activity reviews. The fallback/suspense branch
 * moved to the `posted_to_fallback_account` signal, and the accrual fixed-asset
 * branch moved to the decision-eligible `evaluatePeriodFindings` check — so only
 * the modified-cash asset/liability pattern remains here for V1.
 */
function evaluateAccountActivityReviews({
  accountingBasis,
  accountActivity,
}: {
  accountingBasis: AccountingBasis;
  accountActivity: AccountActivityRow[];
}): CloseReadinessFinding[] {
  if (accountActivity.length === 0) return [];
  if (accountingBasis !== 'modified_cash_basis') return [];

  const hasAssetOrLiabilityPattern = accountActivity.some((row) =>
    MODIFIED_CASH_REVIEW_ELEMENT_KEYS.has(row.account_element_key),
  );
  if (!hasAssetOrLiabilityPattern) return [];

  return [
    buildFinding('cash_fixed_asset_or_liability_pattern_review', {
      relatedAccountTypeKeys: uniqueValues(
        accountActivity.map((row) => row.account_type_key),
      ),
      relatedAccountElementKeys: uniqueValues(
        accountActivity.map((row) => row.account_element_key),
      ),
    }),
  ];
}

async function countDraftJournalEntries(
  queryable: Knex,
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const row = await queryable('journal_entries')
    .join(
      'journal_batches',
      'journal_entries.journal_batch_id',
      'journal_batches.id',
    )
    .where('journal_batches.company_id', companyId)
    .whereBetween('journal_batches.date', [startDate, endDate])
    .where('journal_batches.status', 'draft')
    .where('journal_entries.entry_status', 'active')
    .where('journal_entries.is_deleted', false)
    .count('* as count')
    .first<CountRow>();

  return row ? Number(row.count) : 0;
}

async function countUncategorizedTransactions(
  queryable: Knex,
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const hasLedgerEntry = queryable('ledger_transactions')
    .whereRaw('ledger_transactions.source_transaction_id = bt.id')
    .where('ledger_transactions.transaction_source', 'bank_transaction')
    .where('ledger_transactions.status', 'posted')
    .limit(1);

  const row = await queryable('bank_transactions as bt')
    .join('bank_accounts as ba', 'bt.bank_account_id', 'ba.id')
    .where({ 'ba.company_id': companyId })
    .whereBetween('bt.transaction_date', [startDate, endDate])
    .where('bt.is_deleted', false)
    .whereNotExists(hasLedgerEntry)
    .count('* as count')
    .first<CountRow>();

  return row ? Number(row.count) : 0;
}

function evaluateFinalConfirmations(
  accountingBasis: AccountingBasis,
): CloseReadinessFinding[] {
  if (accountingBasis === 'modified_cash_basis') {
    return [
      buildFinding('cash_off_bank_activity_confirmed'),
      buildFinding('cash_reports_ready_confirmed'),
    ];
  }

  return [
    buildFinding('accrual_revenue_complete_confirmed'),
    buildFinding('accrual_expenses_liabilities_complete_confirmed'),
    buildFinding('external_documents_considered_confirmed'),
    buildFinding('accrual_reports_ready_confirmed'),
  ];
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function getAudience(
  company: CompanyCloseReadinessContext,
): CloseReadinessAudience {
  return company.assigned_firm_id ? 'firm_managed' : 'owner_managed';
}

function getSurfaces(
  company: CompanyCloseReadinessContext,
): CloseReadinessSurface[] {
  if (company.assigned_firm_id) {
    return ['firm_portfolio', 'assignee_work_queue'];
  }

  return ['company_workspace'];
}

function summarizeFindings(
  findings: CloseReadinessFinding[],
): CloseReadinessEvaluation['summary'] {
  return {
    blockerCount: findings.filter((finding) => finding.severity === 'blocker')
      .length,
    requiredReviewCount: findings.filter(
      (finding) => finding.severity === 'required_review',
    ).length,
    advisoryCount: findings.filter((finding) => finding.severity === 'advisory')
      .length,
    finalConfirmationCount: findings.filter(
      (finding) => finding.severity === 'final_confirmation',
    ).length,
  };
}
