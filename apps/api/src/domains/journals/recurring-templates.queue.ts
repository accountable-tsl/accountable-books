import type { Job } from 'bullmq';
import z from 'zod';

import { isProd } from '../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { createQueue } from '../../jobs/queues/queue-factory.js';

export const RECURRING_TEMPLATES_QUEUE_NAME = 'recurring-journal-templates';

export const recurringTemplatesJobDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('scan-due'),
  }),
]);

export type RecurringTemplatesJobData = z.infer<
  typeof recurringTemplatesJobDataSchema
>;

export const recurringTemplatesQueue = createQueue<RecurringTemplatesJobData>(
  RECURRING_TEMPLATES_QUEUE_NAME,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: isProd ? { age: 86400, count: 200 } : { count: 50 },
      removeOnFail: isProd ? { age: 172800, count: 200 } : { count: 50 },
    },
  },
);

export async function scheduleRecurringTemplateScan(
  cronPattern = '0 * * * *',
  tz = 'UTC',
): Promise<Job<RecurringTemplatesJobData> | null> {
  return executeQueueOperation(QueueName.RECURRING_JOURNAL, () =>
    recurringTemplatesQueue.add(
      'recurring-template-scan',
      { type: 'scan-due' },
      {
        repeat: { pattern: cronPattern, tz },
        jobId: 'recurring-template-scan',
      },
    ),
  );
}
