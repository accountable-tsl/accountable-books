import type { Knex } from 'knex';

import {
  buildCloseReadinessFinding,
  type CloseReadinessFinding,
  type CloseReadinessFindingCode,
} from './close-readiness.types.js';

import type { Fingerprint } from '../../../shared/utils/crypto.utils.js';
import type { FiscalPeriodType } from '../fiscal-calendar/fiscal-calendar.types.js';

export type PeriodKey = {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType: FiscalPeriodType;
};

/**
 * A finding the user can acknowledge: its catalog code, the stable `fingerprint`
 * and current `factsHash` that identify the decision, and the presentation
 * inputs. Both signal rollups and period-level findings produce these, so they
 * share one decision-matching path.
 */
export type DecisionEligibleFinding = {
  findingCode: CloseReadinessFindingCode;
  fingerprint: Fingerprint;
  factsHash: Fingerprint;
  relatedCoaIds: string[];
  relatedAccountTypeKeys: string[];
  relatedAccountElementKeys: string[];
  details: Record<string, unknown>;
};

type PeriodFindingDecisionRow = {
  fingerprint: string;
  facts_hash: string;
};

function matchKey(fingerprint: string, factsHash: string): string {
  return `${fingerprint}::${factsHash}`;
}

async function loadDecided(
  queryable: Knex,
  period: PeriodKey,
  fingerprints: string[],
): Promise<Set<string>> {
  if (fingerprints.length === 0) return new Set();

  const rows = await queryable('close_review_decisions')
    .where({
      company_id: period.companyId,
      fiscal_year: period.fiscalYear,
      period_number: period.periodNumber,
      period_type: period.periodType,
      finding_scope: 'period_finding',
    })
    .whereIn('fingerprint', fingerprints)
    .select<PeriodFindingDecisionRow[]>('fingerprint', 'facts_hash');

  return new Set(rows.map((row) => matchKey(row.fingerprint, row.facts_hash)));
}

/**
 * Drop any candidate whose freshly-computed `factsHash` matches a current
 * `period_finding` decision, and emit the rest through the single catalog with
 * their acknowledgement identity attached. The caller always recomputes
 * `factsHash` from live state, so an acknowledgement survives only while the
 * facts are unchanged and re-opens automatically when they change.
 */
export async function dropDecidedAndBuildFindings(
  queryable: Knex,
  period: PeriodKey,
  candidates: DecisionEligibleFinding[],
): Promise<CloseReadinessFinding[]> {
  if (candidates.length === 0) return [];

  const decided = await loadDecided(
    queryable,
    period,
    candidates.map((candidate) => candidate.fingerprint),
  );

  return candidates
    .filter(
      (candidate) => !decided.has(matchKey(candidate.fingerprint, candidate.factsHash)),
    )
    .map((candidate) =>
      buildCloseReadinessFinding(candidate.findingCode, {
        relatedCoaIds: candidate.relatedCoaIds,
        relatedAccountTypeKeys: candidate.relatedAccountTypeKeys,
        relatedAccountElementKeys: candidate.relatedAccountElementKeys,
        details: candidate.details,
        acknowledgement: {
          scope: 'period_finding',
          fingerprint: candidate.fingerprint,
          factsHash: candidate.factsHash,
        },
      }),
    );
}
