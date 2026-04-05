import { Job, Worker } from 'bullmq';
import pino from 'pino';

import { ENV } from '../../config/env.js';
import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { enqueueEvaluateClient } from './task-evaluation.queue.js';
import { evaluateForClient } from './task-evaluation.service.js';

import type { TaskEvaluationJobData } from './task-evaluation.queue.js';

const logger = pino({ name: 'task-evaluation-worker' });

async function processJob(job: Job<TaskEvaluationJobData>): Promise<void> {
  const { data } = job;

  if (data.type === 'evaluate-client') {
    const { firmCompanyId, clientCompanyId } = data;
    logger.info({ jobId: job.id, clientCompanyId }, 'Evaluating client');

    await knexClient.transaction(async (trx) => {
      await evaluateForClient(
        { firmCompanyId, clientCompanyId, domainArea: 'bookkeeping' },
        trx,
      );
    });

    logger.info({ jobId: job.id, clientCompanyId }, 'Client evaluation done');
    return;
  }

  if (data.type === 'sweep') {
    logger.info({ jobId: job.id }, 'Running task evaluation sweep');

    const assignments = await knexClient('client_firm_assignments')
      .where({ is_deleted: false })
      .select('accounting_firm_company_id', 'client_company_id');

    let enqueued = 0;
    for (const row of assignments) {
      await enqueueEvaluateClient(
        row.accounting_firm_company_id,
        row.client_company_id,
      );
      enqueued++;
    }

    logger.info({ jobId: job.id, enqueued }, 'Sweep enqueued evaluations');
    return;
  }

  logger.warn(
    { jobId: job.id, type: (data as { type: string }).type },
    'Unknown job type',
  );
}

const DEFAULT_CONCURRENCY = 3;

export function startTaskEvaluationWorker(
  concurrency?: number,
): Worker<TaskEvaluationJobData> {
  const c =
    concurrency ??
    (Number(ENV.TASK_EVALUATION_CONCURRENCY) || DEFAULT_CONCURRENCY);

  const worker = new Worker<TaskEvaluationJobData>(
    'task-evaluation',
    processJob,
    {
      connection: redis,
      concurrency: c,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      'Task evaluation job failed',
    );
  });

  return worker;
}
