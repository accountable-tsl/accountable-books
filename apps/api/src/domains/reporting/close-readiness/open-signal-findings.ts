import type { Knex } from 'knex';

import { generateFingerprintSync } from '../../../shared/utils/crypto.utils.js';
import {
  dropDecidedAndBuildFindings,
  type DecisionEligibleFinding,
} from './close-finding-decisions.js';
import {
  type CloseReadinessFinding,
  type CloseReadinessFindingCode,
} from './close-readiness.types.js';
import {
  CLOSE_REVIEW_SIGNAL_METADATA,
  SURFACED_CLOSE_REVIEW_SIGNAL_CODES,
  type CloseReviewSignalCode,
} from './signals/close-signals.types.js';

import type { Fingerprint } from '../../../shared/utils/crypto.utils.js';
import type { FiscalPeriodType } from '../fiscal-calendar/fiscal-calendar.types.js';

/**
 * Stable identity of a rollup finding — the unit a user acts on. Identity is the
 * company, period, finding code, and the sorted set of related accounts.
 * Deliberately excludes the child facts: a changed child is a changed
 * `facts_hash`, not a different rollup.
 */
export function buildRollupFingerprint(input: {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
  findingCode: CloseReadinessFindingCode;
  relatedCoaIds: string[];
}): Fingerprint {
  return generateFingerprintSync(
    {
      company: input.companyId,
      fiscalYear: input.fiscalYear,
      periodNumber: input.periodNumber,
      periodType: input.periodType,
      findingCode: input.findingCode,
      relatedCoaIds: [...input.relatedCoaIds].sort(),
    },
    { sortKeys: true },
  );
}

/**
 * Material state of a rollup — the hash of its child signals' sorted
 * `facts_hash`es. Add, remove, or edit any underlying signal and this flips, so
 * a prior acknowledgement no longer matches and the rollup re-opens. This is the
 * whole invalidation guarantee, lifted to the grain users work at.
 */
export function buildRollupFactsHash(childFactsHashes: string[]): Fingerprint {
  return generateFingerprintSync(
    { children: [...childFactsHashes].sort() },
    { sortKeys: true },
  );
}

type OpenSignalRow = {
  code: CloseReviewSignalCode;
  coa_id: string | null;
  account_type_key: string | null;
  account_element_key: string | null;
  facts_hash: string;
};

type RollupAccumulator = {
  coaIds: Set<string>;
  accountTypeKeys: Set<string>;
  accountElementKeys: Set<string>;
  factsHashes: string[];
  signalCodes: Set<CloseReviewSignalCode>;
};

export type PeriodSelector = {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
};

/**
 * One rollup finding's identity and current material state, computed from the
 * period's surfaced signals. The read path (`mergeOpenSignalFindings`) and the
 * write path (`recordCloseReviewDecision`) both go through this so they agree
 * on the exact `fingerprint`/`factsHash` a user acknowledges.
 */
export type OpenSignalRollup = {
  findingCode: CloseReadinessFindingCode;
  relatedCoaIds: string[];
  relatedAccountTypeKeys: string[];
  relatedAccountElementKeys: string[];
  signalCodes: CloseReviewSignalCode[];
  fingerprint: Fingerprint;
  factsHash: Fingerprint;
};

export type MergeOpenSignalFindingsParams = Knexed<PeriodSelector>;

type Knexed<T> = T & { queryable: Knex };

/**
 * Read the period's surfaced close review signals and roll them up to the
 * finding grain — one rollup per finding code + related-account set. The rollup
 * `facts_hash` is the hash of the children's sorted `facts_hash`es, so any added,
 * removed, or edited signal flips it and re-opens a prior acknowledgement.
 *
 * This is the single source of rollup identity, shared by the read and write
 * paths so a recorded decision matches exactly what the user saw.
 */
export async function computeOpenSignalRollups({
  queryable,
  companyId,
  fiscalYear,
  periodNumber,
  periodType,
}: Knexed<PeriodSelector>): Promise<OpenSignalRollup[]> {
  const signals = await queryable('close_review_signals')
    .where({
      company_id: companyId,
      fiscal_year: fiscalYear,
      period_number: periodNumber,
      period_type: periodType,
    })
    .whereIn('code', [...SURFACED_CLOSE_REVIEW_SIGNAL_CODES])
    .select<OpenSignalRow[]>(
      'code',
      'coa_id',
      'account_type_key',
      'account_element_key',
      'facts_hash',
    );

  if (signals.length === 0) return [];

  const groups = groupByFindingCode(signals);
  return [...groups.entries()].map(([findingCode, acc]) => {
    const relatedCoaIds = sortedValues(acc.coaIds);
    return {
      findingCode,
      relatedCoaIds,
      relatedAccountTypeKeys: sortedValues(acc.accountTypeKeys),
      relatedAccountElementKeys: sortedValues(acc.accountElementKeys),
      signalCodes: sortedValues(acc.signalCodes),
      fingerprint: buildRollupFingerprint({
        companyId,
        fiscalYear,
        periodNumber,
        periodType,
        findingCode,
        relatedCoaIds,
      }),
      factsHash: buildRollupFactsHash(acc.factsHashes),
    };
  });
}

/**
 * The period's surfaced signal rollups as decision-eligible candidates (identity
 * + current facts, pre decision-filtering). Shared by the read path and the
 * decision writer so both resolve the exact same finding identity.
 */
export async function computeSignalRollupCandidates(
  params: Knexed<PeriodSelector>,
): Promise<DecisionEligibleFinding[]> {
  const rollups = await computeOpenSignalRollups(params);

  return rollups.map((rollup) => ({
    findingCode: rollup.findingCode,
    fingerprint: rollup.fingerprint,
    factsHash: rollup.factsHash,
    relatedCoaIds: rollup.relatedCoaIds,
    relatedAccountTypeKeys: rollup.relatedAccountTypeKeys,
    relatedAccountElementKeys: rollup.relatedAccountElementKeys,
    details: {
      source: 'close_review_signals',
      signalCodes: rollup.signalCodes,
      signalCount: rollup.signalCodes.length,
    },
  }));
}

/**
 * Roll up the period's surfaced signals, drop any rollup whose freshly-computed
 * `facts_hash` matches a current `period_finding` decision, and emit the rest
 * through the single catalog via `buildCloseReadinessFinding`. Each surfaced
 * finding carries its `acknowledgement` identity so a client can act on it.
 *
 * The server always recomputes the rollup `facts_hash` from current signals — it
 * never trusts a client-supplied hash — so an acknowledgement survives only
 * while the underlying facts are unchanged.
 */
export async function mergeOpenSignalFindings({
  queryable,
  companyId,
  fiscalYear,
  periodNumber,
  periodType,
}: MergeOpenSignalFindingsParams): Promise<CloseReadinessFinding[]> {
  const candidates = await computeSignalRollupCandidates({
    queryable,
    companyId,
    fiscalYear,
    periodNumber,
    periodType,
  });

  return dropDecidedAndBuildFindings(
    queryable,
    { companyId, fiscalYear, periodNumber, periodType },
    candidates,
  );
}

function groupByFindingCode(
  signals: OpenSignalRow[],
): Map<CloseReadinessFindingCode, RollupAccumulator> {
  const groups = new Map<CloseReadinessFindingCode, RollupAccumulator>();

  for (const signal of signals) {
    const meta = CLOSE_REVIEW_SIGNAL_METADATA[signal.code];
    if (!meta || !meta.surfaced) continue;

    const acc =
      groups.get(meta.rollupFindingCode) ??
      ({
        coaIds: new Set<string>(),
        accountTypeKeys: new Set<string>(),
        accountElementKeys: new Set<string>(),
        factsHashes: [],
        signalCodes: new Set<CloseReviewSignalCode>(),
      } satisfies RollupAccumulator);

    if (signal.coa_id) acc.coaIds.add(signal.coa_id);
    if (signal.account_type_key) acc.accountTypeKeys.add(signal.account_type_key);
    if (signal.account_element_key) {
      acc.accountElementKeys.add(signal.account_element_key);
    }
    acc.factsHashes.push(signal.facts_hash);
    acc.signalCodes.add(signal.code);

    groups.set(meta.rollupFindingCode, acc);
  }

  return groups;
}

function sortedValues<T>(values: Set<T>): T[] {
  return [...values].sort();
}
