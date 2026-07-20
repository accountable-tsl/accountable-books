import type { Knex } from 'knex';

import { knexClient as db } from '../../../db/knexClient.js';
import {
  ACTIVITY_EVENT_TYPE,
  writeActivityEventIntent,
} from '../../activity/index.js';
import { computeOpenDecisionEligibleFindings } from './period-findings.js';

import type { FiscalPeriodType } from '../fiscal-calendar/fiscal-calendar.types.js';
import type { CloseReadinessFindingCode } from './close-readiness.types.js';

/**
 * The append-only user actions on a close finding. There is deliberately no
 * `resolved` — a finding is resolved by the underlying signal no longer firing
 * (its absence), not by a decision.
 */
export const CLOSE_REVIEW_DECISION_KINDS = [
  'acknowledged',
  'not_applicable',
  'dismissed',
] as const;
export type CloseReviewDecisionKind =
  (typeof CLOSE_REVIEW_DECISION_KINDS)[number];

export type RecordCloseReviewDecisionInput = {
  companyId: string;
  fiscalYear: number;
  periodNumber: number;
  periodType?: FiscalPeriodType;
  /** The rollup finding being acted on (period_finding scope). */
  findingCode: CloseReadinessFindingCode;
  decision: CloseReviewDecisionKind;
  reason: string;
  decidedById: string;
  /**
   * The `factsHash` the client saw on the finding. When supplied and no longer
   * current, the decision is rejected so a user never acknowledges facts that
   * already changed under them.
   */
  expectedFactsHash?: string;
  trx?: Knex.Transaction;
};

export type RecordedCloseReviewDecision = {
  id: string;
  fingerprint: string;
  factsHash: string;
  decision: CloseReviewDecisionKind;
  decidedAt: string;
};

export type RecordCloseReviewDecisionResult =
  | { ok: true; decision: RecordedCloseReviewDecision }
  | {
      ok: false;
      reason: 'period_not_found';
      message: string;
    }
  | {
      ok: false;
      reason: 'no_open_finding';
      message: string;
    }
  | {
      ok: false;
      reason: 'facts_changed';
      message: string;
      currentFactsHash: string;
    };

type InsertedDecisionRow = {
  id: string;
  fingerprint: string;
  facts_hash: string;
  decision: CloseReviewDecisionKind;
  decided_at: string | Date;
};

/**
 * Record an append-only decision (acknowledge / not applicable / dismiss) on a
 * close review rollup finding.
 *
 * Works for both finding kinds — signal rollups and period-level findings — by
 * resolving the candidate from current state via
 * `computeOpenDecisionEligibleFindings`. The server recomputes the
 * `fingerprint` and `facts_hash` itself (never trusts a client-supplied hash)
 * and stores a self-describing snapshot so the decision survives the underlying
 * signals being hard-deleted on reconciliation. The read path then suppresses
 * the finding only while a decision's `facts_hash` still matches live state;
 * when the facts change, the hash flips and the finding re-opens automatically.
 */
export async function recordCloseReviewDecision(
  input: RecordCloseReviewDecisionInput,
): Promise<RecordCloseReviewDecisionResult> {
  const periodType: FiscalPeriodType = input.periodType ?? 'monthly';

  const exec = async (
    queryable: Knex.Transaction,
  ): Promise<RecordCloseReviewDecisionResult> => {
    const resolved = await computeOpenDecisionEligibleFindings(queryable, {
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      periodNumber: input.periodNumber,
      periodType,
    });

    if (!resolved) {
      return {
        ok: false,
        reason: 'period_not_found',
        message: `Fiscal period not found: ${input.fiscalYear}-${input.periodNumber}-${periodType}`,
      };
    }

    const candidate = resolved.candidates.find(
      (entry) => entry.findingCode === input.findingCode,
    );

    if (!candidate) {
      return {
        ok: false,
        reason: 'no_open_finding',
        message: `No open close review finding "${input.findingCode}" in ${input.fiscalYear}-${input.periodNumber}-${periodType}`,
      };
    }

    if (
      input.expectedFactsHash !== undefined &&
      input.expectedFactsHash !== candidate.factsHash
    ) {
      return {
        ok: false,
        reason: 'facts_changed',
        message:
          'The finding changed since it was last seen; re-review before deciding.',
        currentFactsHash: candidate.factsHash,
      };
    }

    const [row] = await queryable('close_review_decisions')
      .insert({
        company_id: input.companyId,
        fiscal_calendar_id: resolved.period.fiscalCalendarId,
        fingerprint: candidate.fingerprint,
        facts_hash: candidate.factsHash,
        code: input.findingCode,
        finding_scope: 'period_finding',
        ledger_transaction_id: null,
        ledger_entry_id: null,
        facts_snapshot: JSON.stringify({
          relatedCoaIds: candidate.relatedCoaIds,
          relatedAccountTypeKeys: candidate.relatedAccountTypeKeys,
          relatedAccountElementKeys: candidate.relatedAccountElementKeys,
          details: candidate.details,
        }),
        decision: input.decision,
        reason: input.reason.trim(),
        decided_by_id: input.decidedById,
      })
      .returning<InsertedDecisionRow[]>([
        'id',
        'fingerprint',
        'facts_hash',
        'decision',
        'decided_at',
      ]);

    if (!row) {
      throw new Error('Failed to record close review decision');
    }

    await writeActivityEventIntent(queryable, {
      clientCompanyId: input.companyId,
      actor: { type: 'user', userId: input.decidedById },
      sourceEntity: { type: 'close_review_decision', id: row.id },
      fiscalCalendarId: resolved.period.fiscalCalendarId,
      eventType: ACTIVITY_EVENT_TYPE.CLOSE_DECISION_RECORDED,
      idempotencyKey: `activity:${ACTIVITY_EVENT_TYPE.CLOSE_DECISION_RECORDED}:${row.id}`,
      metadata: {
        findingCode: input.findingCode,
        decision: input.decision,
        reason: input.reason.trim(),
        fingerprint: candidate.fingerprint,
        factsHash: candidate.factsHash,
      },
    });
    return {
      ok: true,
      decision: {
        id: row.id,
        fingerprint: row.fingerprint,
        factsHash: row.facts_hash,
        decision: row.decision,
        decidedAt:
          row.decided_at instanceof Date
            ? row.decided_at.toISOString()
            : String(row.decided_at),
      },
    };
  };

  if (input.trx) {
    return exec(input.trx);
  }
  return db.transaction(exec);
}
