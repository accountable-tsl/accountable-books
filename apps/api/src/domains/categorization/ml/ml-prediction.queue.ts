import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';

import { ENV } from '../../../config/env.js';
import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { redis } from '../../../lib/redis.js';

import type { MLPredictionJobData } from './ml-prediction.types.js';

export const ML_PREDICTION_QUEUE_NAME = 'ml-prediction';

const defaultJobOptions: JobsOptions = {
  attempts: Number(ENV.ML_PREDICTION_ATTEMPTS ?? 3),
  backoff: {
    type: 'exponential',
    delay: Number(ENV.ML_PREDICTION_BACKOFF_MS ?? 5000),
  },
  removeOnComplete: { age: 86400, count: 500 }, // keep for 24h
  removeOnFail: { age: 172800, count: 500 }, // keep for 48h
};

export const mlPredictionQueue = new Queue<MLPredictionJobData>(
  ML_PREDICTION_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: defaultJobOptions,
  },
);

/**
 * Enqueue an ML prediction job for a categorization task
 *
 * @param data - Job data containing task ID and enriched transaction
 */
export async function enqueueMLPredictionJob(
  data: MLPredictionJobData,
): Promise<void> {
  // Build a deterministic job id for deduplication
  // Use categorization_task_id as the unique identifier
  const jobId = `${data.companyId}-${data.categorizationTaskId}`;

  const jobOptions: JobsOptions = {
    ...defaultJobOptions,
    jobId,
  };

  await executeQueueOperation(QueueName.ML_PREDICTION, () =>
    mlPredictionQueue.add('predict', data, jobOptions),
  );
}
