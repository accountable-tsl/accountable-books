import type { Knex } from 'knex';

import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/index.js';

/**
 * Ledger audit log event types
 * These events track all changes and operations on ledger transactions
 */
export const LEDGER_AUDIT_EVENT_TYPES = [
  'ledger_posted_auto', // Auto-post happened (from candidate to ledger, no human touch)
  'ledger_posted_manual', // Manual posting by user

  'metadata_updated', // Non-accounting metadata updated

  'ledger_superseded', // Old ledger transaction was replaced by a new one
  'ledger_split_created', // Split happened
  'ledger_reversed', // Ledger reversed, maybe one coming from a manual journal that was reversed

  'ledger_marked_reviewed',
  'ledger_marked_unreviewed',
] as const;

export type LedgerAuditEventType = (typeof LEDGER_AUDIT_EVENT_TYPES)[number];

/**
 * Input for creating a ledger audit log entry
 */
export interface LedgerAuditLogInput {
  ledgerTransactionId: string;
  actorId: string;
  actorType: 'user' | 'system';
  eventType: LedgerAuditEventType;
  categorizationTaskId?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
  trx: Knex.Transaction;
}

/**
 * Create a ledger audit log entry
 *
 * This function records an audit event for a ledger transaction,
 * tracking who performed the action, when, and any relevant context.
 *
 * @param input - Audit log input data
 * @returns The created audit log entry ID
 */
export async function logLedgerEvent(
  input: LedgerAuditLogInput,
): Promise<string> {
  const {
    ledgerTransactionId,
    actorId,
    actorType,
    eventType,
    categorizationTaskId,
    comment,
    metadata,
    trx,
  } = input;

  try {
    const [result] = await trx('ledger_audit_logs')
      .insert({
        ledger_transaction_id: ledgerTransactionId,
        actor_id: actorId,
        actor_type: actorType,
        event_type: eventType,
        event_timestamp: new Date(),
        categorization_task_id: categorizationTaskId ?? null,
        comment: comment ?? null,
        metadata: metadata ?? null,
      })
      .returning('id');

    return String(result.id);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        ledgerTransactionId,
        eventType,
        actorType,
      },
      'Failed to create ledger audit log entry',
    );
    throw error;
  }
}

// /**
//  * Determine the audit log event type based on transaction context
//  *
//  * @param transactionSource - Source of the transaction ('bank_transaction' | 'manual_journal')
//  * @param categorizationSource - Source of categorization ('manual' | 'rule' | 'ml' | 'ml_heuristic')
//  * @returns The appropriate audit log event type
//  */
// export function determineLedgerAuditEventType(
//   transactionSource: 'bank_transaction' | 'manual_journal',
//   categorizationSource: 'manual' | 'rule' | 'ml' | 'ml_heuristic',
// ): LedgerAuditEventType {
//   // Auto-post: bank transaction that was automatically categorized (not manual)
//   if (
//     transactionSource === 'bank_transaction' &&
//     categorizationSource !== 'manual'
//   ) {
//     return 'ledger_posted_auto';
//   }

//   // Manual post: everything else (manual journals, manually reviewed bank transactions)
//   return 'ledger_posted_manual';
// }

// /**
//  * Get categorization task ID from candidate ID
//  *
//  * Helper function to retrieve the categorization_task_id from a candidate
//  * for audit log purposes.
//  *
//  * @param candidateId - The categorization candidate ID
//  * @param trx - Database transaction
//  * @returns The categorization task ID, or null if not found
//  */
// export async function getCategorizationTaskIdFromCandidate(
//   candidateId: string,
//   trx: Knex.Transaction,
// ): Promise<string | null> {
//   try {
//     const candidate = await trx('categorization_candidates')
//       .where({ id: candidateId, is_deleted: false })
//       .first('categorization_task_id');

//     return candidate?.categorization_task_id ?? null;
//   } catch (error) {
//     logger.warn(
//       {
//         error: error instanceof Error ? error.message : 'Unknown error',
//         candidateId,
//       },
//       'Failed to get categorization_task_id from candidate',
//     );
//     return null;
//   }
// }
