import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { redis } from '../../lib/redis.js';
import { runWithJobContext } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';
import { maybeAlertOutboxHealth } from './outbox.alerts.js';
import { dispatchPendingIntents } from './outbox.dispatcher.js';
import { laneFilter, OUTBOX_LANE } from './outbox.lanes.js';
import {
  getOutboxHealthSnapshot,
  purgeProcessedOutboxIntents,
} from './outbox.model.js';
import {
  OUTBOX_DISPATCH_QUEUE_NAME,
  OUTBOX_HEAVY_DISPATCH_QUEUE_NAME,
  outboxDispatchQueue,
  outboxHeavyDispatchQueue,
  scheduleOutboxDrain,
  scheduleOutboxHealthCheck,
  scheduleOutboxHeavyDrain,
  scheduleOutboxPurge,
} from './outbox.queue.js';

import type { OutboxLane } from './outbox.lanes.js';
import type { OutboxDispatchJobData } from './outbox.queue.js';

const logger = getLogger({
  component: 'outbox-dispatch-worker',
  processSource: 'worker',
});

const DEFAULT_CONCURRENCY = 1;

async function processOutboxDispatchJob(
  lane: OutboxLane,
  job: Job,
): Promise<void> {
  const trigger = (job.data as OutboxDispatchJobData | undefined)?.trigger;

  if (trigger === 'purge') {
    await purgeProcessedOutboxIntents();
    return;
  }

  if (trigger === 'health') {
    await maybeAlertOutboxHealth(await getOutboxHealthSnapshot());
    return;
  }

  const result = await dispatchPendingIntents(100, laneFilter(lane));
  if (result.processed || result.deferred || result.failed) {
    logger.info(
      { jobId: job.id, lane, ...result },
      'Outbox dispatch job completed',
    );
  }
}

function registerSchedulers(lane: OutboxLane): void {
  const register = (label: string, fn: () => Promise<void>) =>
    fn().catch((error) =>
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        `Failed to register ${label}`,
      ),
    );

  if (lane === OUTBOX_LANE.HEAVY) {
    register('outbox heavy drain scheduler', scheduleOutboxHeavyDrain);
    return;
  }

  // The fast lane owns the shared maintenance scans (purge + health).
  register('outbox drain scheduler', scheduleOutboxDrain);
  register('outbox purge scheduler', scheduleOutboxPurge);
  register('outbox health scheduler', scheduleOutboxHealthCheck);
}

export function startOutboxDispatchWorker(
  lane: OutboxLane = OUTBOX_LANE.FAST,
  concurrency = DEFAULT_CONCURRENCY,
): Worker {
  registerSchedulers(lane);

  const queueName =
    lane === OUTBOX_LANE.HEAVY
      ? OUTBOX_HEAVY_DISPATCH_QUEUE_NAME
      : OUTBOX_DISPATCH_QUEUE_NAME;

  const worker = new Worker(
    queueName,
    (job) => runWithJobContext(job, () => processOutboxDispatchJob(lane, job)),
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
      { jobId: job?.id, lane, error: error.message },
      'Outbox dispatch job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error(
      { lane, error: error.message },
      'Outbox dispatch worker error',
    );
  });

  return worker;
}

export async function closeOutboxSchedulers(): Promise<void> {
  const targets = [
    {
      queue: outboxDispatchQueue,
      schedulerIds: [
        'outbox-drain-scan',
        'outbox-purge-scan',
        'outbox-health-scan',
      ],
    },
    {
      queue: outboxHeavyDispatchQueue,
      schedulerIds: ['outbox-heavy-drain-scan'],
    },
  ];

  for (const { queue, schedulerIds } of targets) {
    if (typeof queue.removeJobScheduler !== 'function') {
      continue;
    }
    for (const schedulerId of schedulerIds) {
      try {
        await queue.removeJobScheduler(schedulerId);
      } catch (error) {
        logger.warn(
          {
            schedulerId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to remove outbox scheduler',
        );
      }
    }
  }
}
