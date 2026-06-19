import type { Job, JobsOptions } from 'bullmq';
import type { Knex } from 'knex';

import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { createQueue } from '../../jobs/queues/queue-factory.js';
import { runAfterTransactionCommit } from '../../shared/db/after-transaction-commit.js';
import { withJobTelemetry } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';

const logger = getLogger({ component: 'outbox-queue' });

export const OUTBOX_DISPATCH_QUEUE_NAME = 'outbox-dispatch';

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
};

export interface OutboxDispatchJobData {
  trigger: 'kick' | 'drain' | 'purge';
}

export const outboxDispatchQueue = createQueue<OutboxDispatchJobData>(
  OUTBOX_DISPATCH_QUEUE_NAME,
  { defaultJobOptions: DEFAULTS },
);

/**
 * Enqueue a drain of the outbox dispatcher. Returns null when queues are
 * disabled (e.g. tests), where callers reconcile by invoking the dispatcher /
 * materializer directly instead.
 */
export async function enqueueOutboxDispatch(
  trigger: OutboxDispatchJobData['trigger'] = 'kick',
): Promise<Job<OutboxDispatchJobData> | null> {
  const job = await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxDispatchQueue.add(
      'dispatch',
      withJobTelemetry({ trigger }),
    ),
  );
  return job as Job<OutboxDispatchJobData> | null;
}

/**
 * After-commit "kick": ensure the outbox dispatcher runs shortly after the
 * transaction that wrote the intent commits. Never enqueues for rolled-back
 * transactions. Mirrors the after-commit helper pattern used for balance and
 * enrichment jobs.
 */
export async function scheduleOutboxDispatchKickAfterCommit(
  trx?: Knex.Transaction,
): Promise<void> {
  if (!trx) {
    await enqueueOutboxDispatch('kick');
    return;
  }

  runAfterTransactionCommit(trx, () => {
    enqueueOutboxDispatch('kick').catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to enqueue outbox dispatch kick after commit',
      );
    });
  });
}

/**
 * Register the repeatable drain as a durable backstop so any intent missed by a
 * kick (process crash, dropped duplicate) is still reconciled.
 */
export async function scheduleOutboxDrain(
  cronOrEveryMs: { every: number } = { every: 30000 },
): Promise<void> {
  await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxDispatchQueue.upsertJobScheduler(
      'outbox-drain-scan',
      cronOrEveryMs,
      {
        name: 'dispatch',
        data: { trigger: 'drain' as const },
        opts: { priority: 1 },
      },
    ),
  );
}

/**
 * Register the repeatable purge of processed outbox rows so the table does not
 * grow unbounded. Runs on the same dispatch queue/worker via a `purge` trigger;
 * defaults to once per day.
 */
export async function scheduleOutboxPurge(
  cronOrEveryMs: { every: number } = { every: 24 * 60 * 60 * 1000 },
): Promise<void> {
  await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxDispatchQueue.upsertJobScheduler('outbox-purge-scan', cronOrEveryMs, {
      name: 'dispatch',
      data: { trigger: 'purge' as const },
      opts: { priority: 2 },
    }),
  );
}
