import type { Job } from 'bullmq';
import { z } from 'zod';

import { isProd } from '../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { createQueue } from '../../jobs/queues/queue-factory.js';
import { withJobTelemetry } from '../../shared/telemetry/request-context.js';

export const commsDispatchJobSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('delivery'),
    deliveryId: z.uuid(),
  }),
  z.object({
    type: z.literal('scan_due_deliveries'),
    limit: z.number().int().positive().max(1000).default(100),
  }),
  z.object({
    type: z.literal('purge_old_deliveries'),
    retentionDays: z.number().int().positive().max(3650).optional(),
  }),
]);
export type CommsDispatchJob = z.infer<typeof commsDispatchJobSchema>;

export const commsDispatchQueue = createQueue<CommsDispatchJob>(
  'comms-dispatch',
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: isProd ? { age: 3600, count: 100 } : { count: 10 },
      removeOnFail: isProd ? { age: 86400, count: 500 } : { count: 50 },
    },
  },
);

export async function enqueueCommsDelivery(
  deliveryId: string,
  options: { priority?: number } = {},
): Promise<Job<CommsDispatchJob> | null> {
  return executeQueueOperation(QueueName.COMMS_DISPATCH, () =>
    commsDispatchQueue.add(
      'dispatch_delivery',
      withJobTelemetry({ type: 'delivery', deliveryId }),
      {
        jobId: `comms-delivery:${deliveryId}`,
        ...(options.priority ? { priority: options.priority } : {}),
      },
    ),
  );
}

export async function enqueueCommsDueDeliveryScan(
  limit = 100,
): Promise<Job<CommsDispatchJob> | null> {
  return executeQueueOperation(QueueName.COMMS_DISPATCH, () =>
    commsDispatchQueue.add(
      'scan_due_deliveries',
      withJobTelemetry({ type: 'scan_due_deliveries', limit }),
      {
        jobId: 'comms-due-delivery-scan',
        priority: 2,
      },
    ),
  );
}

export async function enqueueCommsDeliveryPurge(
  retentionDays?: number,
): Promise<Job<CommsDispatchJob> | null> {
  return executeQueueOperation(QueueName.COMMS_DISPATCH, () =>
    commsDispatchQueue.add(
      'purge_old_deliveries',
      withJobTelemetry({
        type: 'purge_old_deliveries',
        ...(retentionDays !== undefined ? { retentionDays } : {}),
      }),
      {
        jobId: 'comms-delivery-purge',
        priority: 9,
      },
    ),
  );
}

export async function scheduleCommsDueDeliveryScan(
  cronOrEveryMs: { every: number } = { every: 30000 },
): Promise<void> {
  await executeQueueOperation(QueueName.COMMS_DISPATCH, () =>
    commsDispatchQueue.upsertJobScheduler(
      'comms-due-delivery-scan',
      cronOrEveryMs,
      {
        name: 'scan_due_deliveries',
        data: { type: 'scan_due_deliveries' as const, limit: 100 },
        opts: { priority: 2 },
      },
    ),
  );
}

export async function scheduleCommsDeliveryPurge(
  cronOrEveryMs: { every: number } = { every: 24 * 60 * 60 * 1000 },
): Promise<void> {
  await executeQueueOperation(QueueName.COMMS_DISPATCH, () =>
    commsDispatchQueue.upsertJobScheduler(
      'comms-delivery-purge',
      cronOrEveryMs,
      {
        name: 'purge_old_deliveries',
        data: { type: 'purge_old_deliveries' as const },
        opts: { priority: 9 },
      },
    ),
  );
}
