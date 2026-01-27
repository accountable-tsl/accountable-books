import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';

import type { NewCategorizationTaskInput } from './tasks.types.js';

/**
 * Right now, we only store the most recent enrichment DTO
 * If there was a replay, prob from old txn, we overwrite since the new one is the most recent and likely more accurate
 * If we see we need the DTO that existed before the replay, we'll need a new table say "categorization_task_snapshots" to log / retrieve historical DTOs
 */
const cataskTable = 'categorization_tasks';
export async function upsertCategorizationTask(
  p: NewCategorizationTaskInput,
): Promise<{ didPersist: boolean; checksum: string; taskId: string }> {
  const { trx, bank_transaction_id, checksum } = p;

  const payload = {
    ...p.enriched_transaction,
  };

  payload.ids.enrichment_job_id = p.jobId || null;

  const exec = async (txn: Knex.Transaction) => {
    const existing = await txn(cataskTable)
      .where({
        bank_transaction_id,
        is_deleted: false,
      })
      .forUpdate()
      .first();

    if (existing) {
      // Questions on my mind, is this truly failsafe?
      if (existing.checksum === checksum) {
        logger.debug({
          bankTransactionId: bank_transaction_id,
          categorizationTaskId: existing.id,
          message: 'Categorization task unchanged, skiping persist',
        });

        return {
          didPersist: false,
          checksum: existing.checksum,
          taskId: existing.id,
        };
      }

      // For now, we're updating if DTO changes
      // We can check what changed and store in metadata...
      await txn(cataskTable)
        .where({ id: existing.id })
        .update({
          enriched_transaction: JSON.stringify(payload),
          enrichment_version: p.enrichment_version,
          checksum,
          updated_at: txn.fn.now(),
          metadata: { ...existing?.metadata, ...p.metadata },
        });

      logger.debug({
        bankTransactionId: bank_transaction_id,
        categorizationTaskId: existing.id,
        message: 'Updated existing categorization task with new snapshot',
      });

      return { didPersist: true, checksum, taskId: existing.id };
    }

    const [created] = await txn(cataskTable)
      .insert({
        company_id: p.company_uuid,
        bank_transaction_id,
        bank_transaction_date: p.bank_transaction_date,
        enriched_transaction: JSON.stringify(payload),
        enrichment_version: p.enrichment_version,
        source: p.source,
        checksum,
        created_at: txn.fn.now(),
        updated_at: txn.fn.now(),
        metadata: p.metadata,
      })
      .returning(['id']);

    logger.debug({
      bankTransactionId: bank_transaction_id,
      message: 'Persisted new categorization task',
    });

    return { didPersist: true, checksum, taskId: created.id };
  };

  try {
    if (trx) {
      return await exec(trx);
    } else {
      return await knexClient.transaction(exec);
    }
  } catch (error) {
    logger.error({
      bankTransactionId: bank_transaction_id,
      message: 'Failed to persist categorization task',
      error,
    });
    throw error;
  }
}

export async function softDeleteCategorizationTasks({
  bankTransactionIds,
  reason,
  trx,
}: {
  bankTransactionIds: string[];
  reason?: string | null;
  trx?: Knex.Transaction;
}): Promise<number> {
  if (bankTransactionIds.length === 0) {
    return 0;
  }

  const exec = async (txn: Knex.Transaction) => {
    const metadataPatch = {
      deletion_reason: reason ?? 'bank_transaction_deleted',
      deleted_at: new Date().toISOString(),
    };

    const deleted = await txn(cataskTable)
      .whereIn('bank_transaction_id', bankTransactionIds)
      .andWhere('is_deleted', false)
      .update({
        is_deleted: true,
        updated_at: txn.fn.now(),
        metadata: txn.raw(
          `COALESCE(metadata, '{}'::jsonb) || ?::jsonb`,
          JSON.stringify(metadataPatch),
        ),
      })
      .returning('id');

    return deleted.length;
  };

  try {
    if (trx) {
      return await exec(trx);
    }
    return await knexClient.transaction(exec);
  } catch (error) {
    logger.error(
      { bankTransactionIds, reason, error },
      'Failed to soft delete categorization tasks',
    );
    throw error;
  }
}
