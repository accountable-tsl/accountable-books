import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import pino from 'pino';

import { redis } from '../../lib/redis.js';
import { processDueRecurringTemplates } from './recurring-templates.model.js';
import {
  RECURRING_TEMPLATES_QUEUE_NAME,
  recurringTemplatesJobDataSchema,
} from './recurring-templates.queue.js';

import type { RecurringTemplatesJobData } from './recurring-templates.queue.js';

const logger = pino({ name: 'recurring-templates-worker' });

async function processRecurringTemplatesJob(
  job: Job<RecurringTemplatesJobData>,
) {
  const validation = recurringTemplatesJobDataSchema.safeParse(job.data);
  if (!validation.success) {
    logger.error(
      { jobId: job.id, issues: validation.error.issues },
      'Invalid recurring templates job data',
    );
    throw new Error(
      `Invalid recurring templates job data: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    );
  }

  const data = validation.data;
  logger.info({ jobId: job.id, type: data.type }, 'Starting job');

  if (data.type === 'scan-due') {
    await processDueRecurringTemplates({});
  }
}

export function startRecurringTemplatesWorker(
  concurrency = Number(process.env.RECURRING_TEMPLATES_CONCURRENCY) || 1,
): Worker {
  const worker = new Worker(
    RECURRING_TEMPLATES_QUEUE_NAME,
    processRecurringTemplatesJob,
    {
      connection: redis,
      concurrency,
      drainDelay: 300,
      stalledInterval: 300000,
      maxStalledCount: 2,
      lockDuration: 120000,
      lockRenewTime: 30000,
    },
  );

  worker.on('ready', () => {
    logger.info('Recurring templates worker is ready');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, type: job?.data.type, error: err.message },
      'Recurring templates job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Recurring templates worker error');
  });

  return worker;
}
