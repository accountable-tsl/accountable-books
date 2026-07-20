import type { Job, JobsOptions } from 'bullmq';
import { z } from 'zod';

import {
  executeQueueOperation,
  queueBroker,
  QueueName,
} from '../../../../jobs/queues/queue-broker.js';
import { createQueue } from '../../../../jobs/queues/queue-factory.js';
import { withJobTelemetry } from '../../../../shared/telemetry/request-context.js';

/**
 * Queue for close review signal evaluation.
 *
 * One job re-evaluates and reconciles the signals for a single ledger
 * transaction. Deduped by ledger transaction id so a flurry of writes collapses
 * to one pending evaluation; runs off the ledger write path.
 */
export const enqueueCloseSignalEvalInput = z.object({
  companyId: z.string().trim().min(1),
  ledgerTransactionId: z.string().trim().min(1),
  triggeredBy: z
    .enum(['ledger_write', 'supersession', 'backfill', 'manual'])
    .optional(),
});

export const closeSignalEvalJobDataSchema = enqueueCloseSignalEvalInput.extend({
  type: z.literal('close-signal-eval'),
});
export type CloseSignalEvalJobData = z.infer<
  typeof closeSignalEvalJobDataSchema
>;
export type EnqueueCloseSignalEvalInput = z.infer<
  typeof enqueueCloseSignalEvalInput
>;

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
