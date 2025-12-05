import type { Knex } from 'knex';
import { z } from 'zod';

import { knexClient } from '../../../../db/knexClient.js';
import { logger } from '../../../../shared/index.js';
import { logTaskEventSafe } from '../../tasks/task-events.service.js';
import { type CandidateInput, candidateInput } from './candidates.types.js';

const SOURCE_RANK: Record<'rule' | 'ml' | 'ml_heuristic', number> = {
  rule: 3,
  ml: 2,
  ml_heuristic: 1,
};
// Decide which candidate to keep and which to delete
// Source and confidence are used to determine which candidate to keep
// Rule > ML > ML Heuristic

// Possible outcomes:
// - Keep existing candidate and log
// - Create new candidate and delete existing candidate
// - Delete existing candidate
// - Delete new candidate
interface CandidateConflictInput {
  source: 'rule' | 'ml' | 'ml_heuristic';
  confidence: number;
}

/**
 *
 * @param existing
 * @param newcomer
 * @returns
 */
function shouldReplace(
  existing: CandidateConflictInput,
  newcomer: CandidateConflictInput,
): boolean {
  // Rule always wins
  if (existing.source === 'rule') return false;
  if (newcomer.source === 'rule') return true;

  // Same source type → higher confidence wins
  if (existing.source === newcomer.source) {
    return newcomer.confidence > existing.confidence;
  }

  // Different source → higher rank wins
  return SOURCE_RANK[newcomer.source] > SOURCE_RANK[existing.source];
}

function getReplaceReason(
  existing: CandidateConflictInput,
  newcomer: CandidateConflictInput,
): string {
  if (newcomer.source === 'rule') return 'rule_over_any';
  if (existing.source === 'rule') return 'kept_rule'; // won't happen
  if (existing.source === newcomer.source)
    return newcomer.confidence > existing.confidence
      ? 'higher_confidence'
      : 'kept_equal_or_higher';
  return SOURCE_RANK[newcomer.source] > SOURCE_RANK[existing.source]
    ? 'better_source'
    : 'kept_better_source';
}

export async function persistCategorizationCandidate({
  runId,
  candidate: candidateHead,
  trx,
}: {
  candidate: CandidateInput;
  trx?: Knex.Transaction;
  runId: string;
}) {
  // Check if there's a candidate for this transaction/task
  // find the candidate with the highest confidence
  // If there's a tie between multiple candidates,
  // - prefer rules over ML; rule > ml > ml_heuristic
  // - Still a tie, use the latest one
  const v = candidateInput.safeParse(candidateHead);
  if (!v.success) {
    logger.error({
      message: 'Attempted to persist candidate with invalid inputs',
      errors: z.flattenError(v.error),
    });
    throw new Error('Invalid inputs (@persistCategorizationCandidate)');
  }

  const { candidate_lines, ...c } = v.data;
  if (c.source !== 'rule' && c.source !== 'ml' && c.source !== 'ml_heuristic') {
    throw new Error(`Invalid source - ${c.source}`);
  }

  const exec = async (txn: Knex.Transaction) => {
    // Any existing candidate for this transaction/task?
    const existing = await txn('categorization_candidates')
      .select(['id', 'source', 'confidence'])
      .where({
        bank_transaction_id: c.bank_transaction_id,
        is_deleted: false,
      })
      .first();

    if (existing && !shouldReplace(existing, c as CandidateConflictInput)) {
      await logTaskEventSafe({
        run_id: runId,
        categorization_task_id: c.categorization_task_id,
        source: c.source,
        event_type: 'candidate_ignored',
        event_timestamp: new Date(),
        metadata: {
          kept_candidate_id: existing.id,
          previous_source: existing.source,
          previous_confidence: existing.confidence,
          new_source: c.source,
          new_confidence: c.confidence,
          reason: getReplaceReason(existing, c as CandidateConflictInput),
        },
        trx: txn,
      });
      return;
    }

    if (existing) {
      await txn('categorization_candidates')
        .where({ id: existing.id })
        .update({ is_deleted: true, deleted_at: txn.fn.now() });

      await txn('categorization_candidate_lines')
        .where({ candidate_id: existing.id })
        .update({ is_deleted: true, deleted_at: txn.fn.now() });

      await logTaskEventSafe({
        run_id: runId,
        categorization_task_id: c.categorization_task_id,
        source: c.source,
        event_type: 'candidate_replaced',
        event_timestamp: new Date(),
        metadata: {
          replaced_candidate_id: existing.id,
          previous_source: existing.source,
          previous_confidence: existing.confidence,
          new_source: c.source,
          new_confidence: c.confidence,
          reason: getReplaceReason(existing, c as CandidateConflictInput),
        },
        trx: txn,
      });
    }

    // If we get here, we need to persist the new candidate
    const [candidateId] = await txn('categorization_candidates')
      .insert(c)
      .returning('id');

    await txn('categorization_candidate_lines').insert(
      candidate_lines.map((l) => ({ ...l, candidate_id: candidateId })),
    );

    await logTaskEventSafe({
      run_id: runId,
      categorization_task_id: c.categorization_task_id,
      source: c.source,
      event_type: 'candidate_created',
      event_timestamp: new Date(),
      metadata: {
        replaced_existing: existing ? true : false,
        previous_source: existing?.source ?? null,
        previous_confidence: existing?.confidence ?? null,
        new_source: c.source,
        new_confidence: c.confidence,
        reason: existing
          ? getReplaceReason(existing, c as CandidateConflictInput)
          : 'first_candidate',
        candidate_id: candidateId, // the new one we just inserted
      },
      trx: txn,
    });
  };

  if (trx) {
    await exec(trx);
  } else {
    await knexClient.transaction(exec);
  }
}
