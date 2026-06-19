import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { redis } from '../../lib/redis.js';
import { runWithJobContext } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';
import { dispatchPendingIntents } from './outbox.dispatcher.js';
import { purgeProcessedOutboxIntents } from './outbox.model.js';
import {
  OUTBOX_DISPATCH_QUEUE_NAME,
  outboxDispatchQueue,
  scheduleOutboxDrain,
  scheduleOutboxPurge,
  type OutboxDispatchJobData,
} from './outbox.queue.js';

const logger = getLogger({
  component: 'outbox-dispatch-worker',
  processSource: 'worker',
});

const DEFAULT_CONCURRENCY = 1;

/**
 * Process an outbox dispatch job. The `purge` trigger runs table maintenance
 * (deleting old processed rows); every other trigger drains all currently
 * pending intents. Idempotent: each intent is claimed with FOR UPDATE SKIP
 * LOCKED, so multiple workers and overlapping kick/drain jobs are safe.
 */
async function processOutboxDispatchJob(job: Job): Promise<void> {
  const trigger = (job.data as OutboxDispatchJobData | undefined)?.trigger;

  if (trigger === 'purge') {
    await purgeProcessedOutboxIntents();
    return;
  }

  const result = await dispatchPendingIntents();
  if (result.processed || result.deferred || result.failed) {
    logger.info(
      { jobId: job.id, ...result },
      'Outbox dispatch job completed',
    );
  }
}

export function startOutboxDispatchWorker(
  concurrency = DEFAULT_CONCURRENCY,
): Worker {
  // Register the repeatable drain backstop and retention purge when the worker
  // process boots.
  scheduleOutboxDrain().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to register outbox drain scheduler',
    );
  });
  scheduleOutboxPurge().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to register outbox purge scheduler',
    );
  });

  const worker = new Worker(
    OUTBOX_DISPATCH_QUEUE_NAME,
    (job) => runWithJobContext(job, () => processOutboxDispatchJob(job)),
    {
      connection: redis,
      concurrency,
      drainDelay: 300,
      stalledInterval: 60000,
      maxStalledCount: 2,
      lockDuration: 60000,
      lockRenewTime: 30000,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Outbox dispatch job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Outbox dispatch worker error');
  });

  return worker;
}

export async function closeOutboxSchedulers(): Promise<void> {
  if (typeof outboxDispatchQueue.removeJobScheduler !== 'function') {
    return;
  }
  for (const schedulerId of ['outbox-drain-scan', 'outbox-purge-scan']) {
    try {
      await outboxDispatchQueue.removeJobScheduler(schedulerId);
    } catch (error) {
      logger.warn(
        { schedulerId, error: error instanceof Error ? error.message : String(error) },
        'Failed to remove outbox scheduler',
      );
    }
  }
}
