import type { Job, JobsOptions } from 'bullmq';
import type { Knex } from 'knex';

import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { createQueue } from '../../jobs/queues/queue-factory.js';
import { runAfterTransactionCommit } from '../../shared/db/after-transaction-commit.js';
import { withJobTelemetry } from '../../shared/telemetry/request-context.js';
import { HEAVY_LANE_INTENTS, OUTBOX_LANE } from './outbox.lanes.js';

import type { OutboxIntentType } from './intents.js';
import type { OutboxLane } from './outbox.lanes.js';

export const OUTBOX_DISPATCH_QUEUE_NAME = 'outbox-dispatch';
export const OUTBOX_HEAVY_DISPATCH_QUEUE_NAME = 'outbox-dispatch-heavy';

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 100 },
};

export interface OutboxDispatchJobData {
  trigger: 'drain' | 'purge' | 'health';
}

export const outboxDispatchQueue = createQueue<OutboxDispatchJobData>(
  OUTBOX_DISPATCH_QUEUE_NAME,
  { defaultJobOptions: DEFAULTS },
);

export const outboxHeavyDispatchQueue = createQueue<OutboxDispatchJobData>(
  OUTBOX_HEAVY_DISPATCH_QUEUE_NAME,
  { defaultJobOptions: DEFAULTS },
);

export async function enqueueOutboxDispatch(
  trigger: OutboxDispatchJobData['trigger'] = 'drain',
  lane: OutboxLane = OUTBOX_LANE.FAST,
): Promise<Job<OutboxDispatchJobData> | null> {
  const queue =
    lane === OUTBOX_LANE.HEAVY ? outboxHeavyDispatchQueue : outboxDispatchQueue;
  const job = await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    queue.add('dispatch', withJobTelemetry({ trigger })),
  );
  return job as Job<OutboxDispatchJobData> | null;
}

/**
 * After `trx` commits, wake the lane that owns `intentType` so a freshly written
 * intent is picked up promptly instead of waiting for the next scheduled drain.
 * Best-effort (the drain scheduler is the backstop) and deduped to one nudge per
 * lane per transaction, so a bulk write doesn't fan out into many nudges.
 */
export function scheduleOutboxDrainNudge(
  trx: Knex.Transaction,
  intentType: OutboxIntentType,
): void {
  const lane = HEAVY_LANE_INTENTS.includes(intentType)
    ? OUTBOX_LANE.HEAVY
    : OUTBOX_LANE.FAST;

  const tx = trx as Knex.Transaction & {
    __outboxNudgedLanes?: Set<OutboxLane>;
  };
  const nudged = (tx.__outboxNudgedLanes ??= new Set<OutboxLane>());
  if (nudged.has(lane)) {
    return;
  }
  nudged.add(lane);

  runAfterTransactionCommit(trx, () => {
    void enqueueOutboxDispatch('drain', lane);
  });
}

export async function scheduleOutboxDrain(
  cronOrEveryMs: { every: number } = { every: 30000 },
): Promise<void> {
  await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxDispatchQueue.upsertJobScheduler('outbox-drain-scan', cronOrEveryMs, {
      name: 'dispatch',
      data: { trigger: 'drain' as const },
      opts: { priority: 1 },
    }),
  );
}

export async function scheduleOutboxHeavyDrain(
  cronOrEveryMs: { every: number } = { every: 30000 },
): Promise<void> {
  await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxHeavyDispatchQueue.upsertJobScheduler(
      'outbox-heavy-drain-scan',
      cronOrEveryMs,
      {
        name: 'dispatch',
        data: { trigger: 'drain' as const },
        opts: { priority: 1 },
      },
    ),
  );
}

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

export async function scheduleOutboxHealthCheck(
  cronOrEveryMs: { every: number } = { every: 5 * 60 * 1000 },
): Promise<void> {
  await executeQueueOperation(QueueName.OUTBOX_DISPATCH, () =>
    outboxDispatchQueue.upsertJobScheduler(
      'outbox-health-scan',
      cronOrEveryMs,
      {
        name: 'dispatch',
        data: { trigger: 'health' as const },
        opts: { priority: 2 },
      },
    ),
  );
}
