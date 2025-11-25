import { Worker } from 'bullmq';
import { redis } from '../../../lib/redis.js';
import { logger } from '../../../shared/index.js';
import type { MLPredictionJobData } from './ml-prediction.types.js';
import { ML_PREDICTION_QUEUE_NAME } from './ml-prediction.queue.js';
import { processMLPrediction } from './ml-prediction.service.js';

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
  concurrency = Number(process.env.ML_WORKER_CONCURRENCY ?? 5),
): Worker<MLPredictionJobData> {
  const worker = new Worker<MLPredictionJobData>(
    ML_PREDICTION_QUEUE_NAME,
    async (job) => {
      await processMLPrediction(job.data);
    },
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
