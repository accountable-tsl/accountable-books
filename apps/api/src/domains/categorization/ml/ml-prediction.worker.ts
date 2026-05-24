import { Worker } from 'bullmq';

import { ENV } from '../../../config/env.js';
import { redis } from '../../../lib/redis.js';
import { runWithJobContext } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import { ML_PREDICTION_QUEUE_NAME } from './ml-prediction.queue.js';
import { processMLPrediction } from './ml-prediction.service.js';

import type { MLPredictionJobData } from './ml-prediction.types.js';

const logger = getLogger({
  component: 'ml-prediction-worker',
  processSource: 'worker',
});

/**
 * Start the ML prediction worker
 *
 * Worker processes ML prediction jobs from the queue by:
 * 1. Calling ML Engine API with enriched transaction data
 * 2. Persisting ML predictions to database
 * 3. Updating categorization task metadata
 *
 * @param concurrency - Number of concurrent jobs to process (default: 5)
 * @returns Worker instance
 */
export function startMLPredictionWorker(
  concurrency = Number(ENV.ML_WORKER_CONCURRENCY ?? 5),
): Worker<MLPredictionJobData> {
  const worker = new Worker<MLPredictionJobData>(
    ML_PREDICTION_QUEUE_NAME,
    (job) =>
      runWithJobContext(job, async () => {
        await processMLPrediction(job.data);
      }),
    {
      connection: redis,
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.debug(
      {
        jobId: job.id,
        categorizationTaskId: job.data.categorizationTaskId,
        bankTransactionId: job.data.bankTransactionId,
      },
      'ML prediction job completed',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        categorizationTaskId: job?.data.categorizationTaskId,
        bankTransactionId: job?.data.bankTransactionId,
        error: err,
      },
      'ML prediction job failed',
    );
  });

  logger.info({ concurrency }, 'ML prediction worker started');

  return worker;
}
