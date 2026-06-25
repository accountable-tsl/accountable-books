import type { AccountingBasis } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import { toYMD } from '../../../shared/utils/date.utils.js';
import { getAccountActivity } from './account-activity.js';
import {
  dropDecidedAndBuildFindings,
  periodKeyFromFiscalCalendar,
} from './close-finding-decisions.js';
import {
  buildRollupFactsHash,
  buildRollupFingerprint,
  computeSignalRollupCandidates,
} from './open-signal-findings.js';

import type { AccountElementKey } from '../../../bootstrap/catalogs/accounting/account-elements.js';
import type { AccountActivityRow } from './account-activity.js';
import type {
  DecisionEligibleFinding,
  PeriodKey,
} from './close-finding-decisions.js';
import type { CloseReadinessFinding } from './close-readiness.types.js';

export { getAccountActivity, type AccountActivityRow };

const FIXED_ASSET_ELEMENT_KEYS = new Set<AccountElementKey>([
  'non_current_asset',
]);
const DEPRECIATION_EXPENSE_TYPE_KEY = 'exp_opex_depreciation_amortization';
const CONTRA_ASSET_ELEMENT_KEY: AccountElementKey = 'contra_asset';

/** A period FX revaluation is recorded as this fx_position_movements source. */
const FX_REVALUATION_SOURCE_TYPE = 'period_revaluation';

export type EvaluatePeriodFindingsParams = {
  queryable: Knex;
  accountingBasis: AccountingBasis;
  period: PeriodKey;
  startDate: string;
  endDate: string;
  /** Posted account activity for the period (shared with the live reviews). */
  accountActivity: AccountActivityRow[];
};

export type OpenDecisionEligibleFindingsResult = {
  period: PeriodKey;
  candidates: DecisionEligibleFinding[];
};

/**
 * Period-level close findings: computed at read time from the GL and the FX
 * register (not from a single ledger transaction), and run through the same
 * `period_finding` decision-matching as the signal rollups, so they are
 * acknowledgeable and re-open when their facts change.
 *
 * Both checks are modified-accrual concerns; modified-cash companies get none
 * here (their fixed-asset/liability pattern stays a live recompute-only review).
 */
export async function evaluatePeriodFindings(
  params: EvaluatePeriodFindingsParams,
): Promise<CloseReadinessFinding[]> {
  const candidates = await computePeriodFindingCandidates(params);
  return dropDecidedAndBuildFindings(
    params.queryable,
    params.period,
    candidates,
  );
}

/**
 * The period-level findings as decision-eligible candidates (identity + current
 * facts, pre decision-filtering). Shared by the read path and the decision
 * writer so both resolve the exact same finding identity.
 */
export async function computePeriodFindingCandidates(
  params: EvaluatePeriodFindingsParams,
): Promise<DecisionEligibleFinding[]> {
  if (params.accountingBasis !== 'modified_accrual_basis') return [];

  const candidates: DecisionEligibleFinding[] = [];

  const capex = buildCapexWithoutDepreciationCandidate(params);
  if (capex) candidates.push(capex);

  const fx = await buildFxBalancesWithoutRevaluationCandidate(params);
  if (fx) candidates.push(fx);

  return candidates;
}

type PeriodContextRow = {
  id: string;
  company_id: string;
  fiscal_year: number;
  period_number: number;
  period_type: PeriodKey['periodType'];
  accounting_basis: AccountingBasis;
  start_date: string;
  end_date: string;
};

/**
 * Every open decision-eligible finding for a period — signal rollups plus
 * period-level findings — as raw candidates. This is the writer's view: it
 * loads the company basis, the period dates, and the account activity, then
 * unions both sources so a decision can be recorded against either kind by code.
 * Returns null when the company or period does not exist.
 */
export async function computeOpenDecisionEligibleFindings(
  queryable: Knex,
  selector: Pick<
    PeriodKey,
    'companyId' | 'fiscalYear' | 'periodNumber' | 'periodType'
  >,
): Promise<OpenDecisionEligibleFindingsResult | null> {
  const context = await queryable('companies as co')
    .join('fiscal_calendar as fc', function () {
      this.on('fc.company_id', 'co.id');
    })
    .where('co.id', selector.companyId)
    .andWhere('fc.fiscal_year', selector.fiscalYear)
    .andWhere('fc.period_number', selector.periodNumber)
    .andWhere('fc.period_type', selector.periodType)
    .first<PeriodContextRow | undefined>(
      'fc.id',
      'fc.company_id',
      'fc.fiscal_year',
      'fc.period_number',
      'fc.period_type',
      'co.accounting_basis',
      queryable.raw('fc.start_date::text as start_date'),
      queryable.raw('fc.end_date::text as end_date'),
    );

  if (!context) return null;

  const period = periodKeyFromFiscalCalendar(context);
  const startDate = toYMD(context.start_date);
  const endDate = toYMD(context.end_date);
  const accountActivity = await getAccountActivity({
    queryable,
    companyId: period.companyId,
    startDate,
    endDate,
  });

  const [signalCandidates, periodCandidates] = await Promise.all([
    computeSignalRollupCandidates({ queryable, ...period }),
    computePeriodFindingCandidates({
      queryable,
      accountingBasis: context.accounting_basis,
      period,
      startDate,
      endDate,
      accountActivity,
    }),
  ]);

  return {
    period,
    candidates: [...signalCandidates, ...periodCandidates],
  };
}

/**
 * `capex_without_depreciation_movement` → `fixed_asset_depreciation_review`.
 * Fixed-asset accounts moved this period but no depreciation expense or
 * accumulated-depreciation (contra-asset) movement accompanied them, so the
 * periodic depreciation charge is likely missing.
 */
function buildCapexWithoutDepreciationCandidate(
  params: EvaluatePeriodFindingsParams,
): DecisionEligibleFinding | null {
  const fixedAssetRows = params.accountActivity.filter((row) =>
    FIXED_ASSET_ELEMENT_KEYS.has(row.account_element_key),
  );
  if (fixedAssetRows.length === 0) return null;

  const depreciationMoved = params.accountActivity.some(
    (row) =>
      row.account_type_key === DEPRECIATION_EXPENSE_TYPE_KEY ||
      row.account_element_key === CONTRA_ASSET_ELEMENT_KEY,
  );
  if (depreciationMoved) return null;

  const relatedCoaIds = sortedUnique(fixedAssetRows.map((row) => row.coa_id));
  const findingCode = 'fixed_asset_depreciation_review' as const;

  return {
    findingCode,
    fingerprint: buildRollupFingerprint({
      ...params.period,
      findingCode,
      relatedCoaIds,
    }),
    // Material fact: which fixed-asset accounts moved without depreciation. If
    // depreciation later posts, the candidate is not produced and the finding
    // disappears; if the set of accounts changes, the identity changes.
    factsHash: buildRollupFactsHash(relatedCoaIds),
    relatedCoaIds,
    relatedAccountTypeKeys: sortedUnique(
      fixedAssetRows.map((row) => row.account_type_key),
    ),
    relatedAccountElementKeys: ['non_current_asset'],
    details: {
      source: 'period_finding',
      check: 'capex_without_depreciation_movement',
      fixedAssetAccountCount: relatedCoaIds.length,
    },
  };
}

/**
 * `fx_balances_without_revaluation` → `fx_revaluation_decision_review`. Open
 * foreign-currency monetary positions exist but no period revaluation was
 * recorded, so unrealized FX gains/losses are unaccounted for at close.
 *
 * Sourced from the FX register directly (`fx_positions` / `fx_position_movements`)
 * rather than the `monetary_fx_leg` signal, which only marks period activity and
 * would miss positions carried in from a prior period. `fx_positions` is a
 * current-state snapshot; for the open period being closed (≈ now) that is the
 * period-end exposure.
 */
async function buildFxBalancesWithoutRevaluationCandidate(
  params: EvaluatePeriodFindingsParams,
): Promise<DecisionEligibleFinding | null> {
  const { queryable, period, startDate, endDate } = params;

  const openPositions = await queryable('fx_positions')
    .where({ company_id: period.companyId, state: 'open' })
    .whereNot('open_fx_amount', 0)
    .select<
      { account_id: string; open_fx_amount: string | number }[]
    >('account_id', 'open_fx_amount');
  if (openPositions.length === 0) return null;

  const revalued = await queryable('fx_position_movements')
    .where({
      company_id: period.companyId,
      source_type: FX_REVALUATION_SOURCE_TYPE,
    })
    .whereBetween('movement_date', [startDate, endDate])
    .first('id');
  if (revalued) return null;

  const relatedCoaIds = sortedUnique(
    openPositions.map((position) => position.account_id),
  );
  const findingCode = 'fx_revaluation_decision_review' as const;

  return {
    findingCode,
    fingerprint: buildRollupFingerprint({
      ...period,
      findingCode,
      relatedCoaIds,
    }),
    // Material facts: the open exposure per account, so a material change in any
    // position re-opens a prior acknowledgement.
    factsHash: buildRollupFactsHash(
      openPositions
        .map(
          (position) =>
            `${position.account_id}:${Number(position.open_fx_amount).toFixed(3)}`,
        )
        .sort(),
    ),
    relatedCoaIds,
    relatedAccountTypeKeys: [],
    relatedAccountElementKeys: [],
    details: {
      source: 'period_finding',
      check: 'fx_balances_without_revaluation',
      openPositionCount: openPositions.length,
    },
  };
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
