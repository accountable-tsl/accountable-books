import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import z from 'zod';

import { isProd } from '../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { redis } from '../../lib/redis.js';
import { withJobTelemetry } from '../../shared/telemetry/request-context.js';

export const JOURNAL_AUTO_REVERSAL_QUEUE_NAME = 'journal-auto-reversal';

export const journalAutoReversalJobDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('scan-due'),
  }),
  z.object({
    type: z.literal('reverse-one'),
    journalBatchId: z.uuid(),
    companyId: z.string().min(1),
    reversalDate: z.string().optional(),
  }),
]);

export type JournalAutoReversalJobData = z.infer<
  typeof journalAutoReversalJobDataSchema
>;

export const journalAutoReversalQueue = new Queue<JournalAutoReversalJobData>(
  JOURNAL_AUTO_REVERSAL_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: isProd ? { age: 86400, count: 200 } : { count: 50 },
      removeOnFail: isProd ? { age: 172800, count: 200 } : { count: 50 },
    },
  },
);

export async function scheduleDailyJournalAutoReversalScan(
  cronPattern = '0 3 * * *',
  tz = 'UTC',
): Promise<Job<JournalAutoReversalJobData> | null> {
  return executeQueueOperation(QueueName.JOURNAL_AUTO_REVERSAL, () =>
    journalAutoReversalQueue.add(
      'journal-auto-reversal-scan',
      { type: 'scan-due' },
      {
        repeat: { pattern: cronPattern, tz },
        jobId: 'journal-auto-reversal-daily-scan',
      },
    ),
  );
}

export async function scheduleJournalAutoReversal({
  journalBatchId,
  companyId,
  reversalDate,
}: {
  journalBatchId: string;
  companyId: string;
  reversalDate: string | Date;
}): Promise<Job<JournalAutoReversalJobData> | null> {
  const date =
    reversalDate instanceof Date ? reversalDate : new Date(reversalDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid reversal date');
  }

  const delayMs = Math.max(0, date.getTime() - Date.now());
  const jobId = `journal-auto-reversal:${journalBatchId}`;

  return executeQueueOperation(QueueName.JOURNAL_AUTO_REVERSAL, () =>
    journalAutoReversalQueue.add(
      'journal-auto-reversal-single',
      withJobTelemetry({
        type: 'reverse-one',
        journalBatchId,
        companyId,
        reversalDate: date.toISOString(),
      }),
      { jobId, delay: delayMs },
    ),
  );
}
