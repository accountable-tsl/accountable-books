import { redis } from '../../../lib/redis.js';
import { logger } from '../../../shared/index.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';
import { enqueueRuleRunJob } from '../rules/rule-runner.queue.js';

export const TRANSACTION_ENRICHED_EVENT = 'transaction-enriched';
export type TransactionEnrichedEventData = {
  company_uuid: string;
  bank_transaction_id: string;
  categorization_task_id: string;
  enriched_transaction: EnrichedTransaction;
};
export type TransactionEnrichedEvent = {
  type: typeof TRANSACTION_ENRICHED_EVENT;
  emittedAt: string;
  data: TransactionEnrichedEventData;
};

export const TRANSACTION_DELETED_EVENT = 'transaction-deleted';
export type TransactionDeletedEventData = {
  company_uuid: string;
  bank_transaction_ids: string[];
  reason?: string | null;
};
export type TransactionDeletedEvent = {
  type: typeof TRANSACTION_DELETED_EVENT;
  emittedAt: string;
  data: TransactionDeletedEventData;
};

export async function emitTxnEnrichedEvent(
  data: TransactionEnrichedEventData,
): Promise<void> {
  try {
    await enqueueRuleRunJob(data);
    logger.debug({
      bankTransactionId: data.bank_transaction_id,
      message: 'transaction-enriched job enqueued',
    });
  } catch (error) {
    logger.error({
      bankTransactionId: data.bank_transaction_id,
      message: 'Failed to enqueue transaction-enriched job',
      error,
    });

    throw error;
  }
}

export async function emitTxnDeletedEvent(
  data: TransactionDeletedEventData,
): Promise<void> {
  const payload: TransactionDeletedEvent = {
    type: TRANSACTION_DELETED_EVENT,
    emittedAt: new Date().toISOString(),
    data,
  };

  try {
    await redis.publish(TRANSACTION_DELETED_EVENT, JSON.stringify(payload));
    logger.debug(
      {
        bankTransactionIds: data.bank_transaction_ids,
        companyId: data.company_uuid,
      },
      'transaction-deleted event emitted',
    );
  } catch (error) {
    logger.error(
      {
        bankTransactionIds: data.bank_transaction_ids,
        companyId: data.company_uuid,
        error,
      },
      'Failed to emit transaction-deleted event',
    );
    throw error;
  }
}
