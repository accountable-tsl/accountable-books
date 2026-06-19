import type { Job, JobsOptions } from 'bullmq';
import type { Knex } from 'knex';
import { z } from 'zod';

import {
  executeQueueOperation,
  queueBroker,
  QueueName,
} from '../../../../jobs/queues/queue-broker.js';
import { createQueue } from '../../../../jobs/queues/queue-factory.js';
import { runAfterTransactionCommit } from '../../../../shared/db/after-transaction-commit.js';
import { withJobTelemetry } from '../../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../../shared/utils/logger.js';

/**
 * Queue for close review signal evaluation.
 *
 * One job re-evaluates and reconciles the signals for a single ledger
 * transaction. Deduped by ledger transaction id so a flurry of writes collapses
 * to one pending evaluation; runs off the ledger write path.
 */
export const closeSignalEvalJobDataSchema = z.object({
  type: z.literal('close-signal-eval'),
  companyId: z.string().trim().min(1),
  ledgerTransactionId: z.string().trim().min(1),
  triggeredBy: z
    .enum(['ledger_write', 'supersession', 'backfill', 'manual'])
    .optional(),
});
export type CloseSignalEvalJobData = z.infer<
  typeof closeSignalEvalJobDataSchema
>;
export type EnqueueCloseSignalEvalInput = Omit<CloseSignalEvalJobData, 'type'>;

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 200 },
  removeOnFail: { age: 172800, count: 200 },
  priority: 5,
};

export const closeSignalEvalQueue = createQueue<CloseSignalEvalJobData>(
  'close-signal-eval',
  { defaultJobOptions: DEFAULTS },
);

const logger = getLogger({ component: 'close-signal-eval-queue' });

/**
 * Enqueue signal evaluation for one ledger transaction, deduped by transaction
 * id. Returns null when queues are disabled.
 */
export async function enqueueCloseSignalEval(
  data: EnqueueCloseSignalEvalInput,
): Promise<Job<CloseSignalEvalJobData> | null> {
  if (!queueBroker.shouldExecute()) return null;

  const dataWithType = { ...data, type: 'close-signal-eval' as const };
  const v = closeSignalEvalJobDataSchema.safeParse(dataWithType);
  if (!v.success) {
    throw new Error(
      v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }

  const jobId = `cse-${v.data.ledgerTransactionId}`;
  const job = await executeQueueOperation(QueueName.CLOSE_SIGNAL_EVAL, () =>
    closeSignalEvalQueue.add('close-signal-eval', withJobTelemetry(v.data), {
      jobId,
    }),
  );
  return job as Job<CloseSignalEvalJobData> | null;
}

/**
 * Enqueue after the surrounding transaction commits, so signal evaluation never
 * runs against rows that may roll back and never blocks the ledger write.
 */
export async function scheduleCloseSignalEvalAfterCommit(
  data: EnqueueCloseSignalEvalInput,
  trx?: Knex.Transaction,
): Promise<Job<CloseSignalEvalJobData> | null> {
  if (!trx) return enqueueCloseSignalEval(data);

  runAfterTransactionCommit(trx, () => {
    enqueueCloseSignalEval(data).catch((error) => {
      logger.error(
        {
          companyId: data.companyId,
          ledgerTransactionId: data.ledgerTransactionId,
          triggeredBy: data.triggeredBy,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to enqueue close signal evaluation after transaction commit',
      );
    });
  });

  return null;
}
