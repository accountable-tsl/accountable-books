import type { JobsOptions } from 'bullmq';
import z from 'zod';

import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { createQueue } from '../../../jobs/queues/queue-factory.js';
import { withJobTelemetry } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';

const logger = getLogger({ component: 'autopost-queue' });

/**
 * Queue for delayed autopost jobs
 *
 * Processes candidates that should be autoposted after a delay period
 * (e.g., 7 days for ML predictions with high confidence)
 */

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 200 }, // Keep for 24h
  removeOnFail: { age: 172800, count: 200 }, // Keep failures for 48h
  priority: 2, // Lower priority than immediate operations
};

export const AUTOPOST_QUEUE_NAME = 'categorization-autopost';

// Job data schema
export const autopostJobDataSchema = z.object({
  candidateId: z.uuid(),
  companyId: z.uuid(),
  runId: z.uuid(),
});

export type AutopostJobData = z.infer<typeof autopostJobDataSchema>;

export const autopostQueue = createQueue<AutopostJobData>(AUTOPOST_QUEUE_NAME, {
  defaultJobOptions: DEFAULTS,
});

/**
 * Enqueue a delayed autopost job
 * @param candidateId - ID of the candidate to autopost
 * @param companyId - Company ID
 * @param runId - Run ID for tracking
 * @param delayMs - Delay in milliseconds before processing
 * @returns The created job or null if queues are disabled
 */
export async function enqueueDelayedAutopost({
  candidateId,
  companyId,
  runId,
  delayMs,
}: {
  candidateId: string;
  companyId: string;
  runId: string;
  delayMs: number;
}): Promise<void> {
  const jobData: AutopostJobData = {
    candidateId,
    companyId,
    runId,
  };

  // Validate job data
  const validation = autopostJobDataSchema.safeParse(jobData);
  if (!validation.success) {
    logger.error(
      { error: validation.error, jobData },
      'Invalid autopost job data',
    );
    throw new Error(
      `Invalid autopost job data: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    );
  }

  // Use a deterministic job ID for deduplication
  // Format: autopost:{candidateId}
  const jobId = `autopost:${candidateId}`;

  try {
    await executeQueueOperation(QueueName.AUTOPOST, () =>
      autopostQueue.add(
        'autopost-candidate',
        withJobTelemetry(validation.data),
        {
          jobId,
          delay: delayMs,
          priority: 2, // Lower priority than immediate operations
        },
      ),
    );

    logger.info(
      {
        candidateId,
        companyId,
        delayMs,
        delayMinutes: Math.round(delayMs / 60000),
      },
      'Delayed autopost job enqueued',
    );
  } catch (error) {
    logger.error(
      { error, candidateId, companyId, delayMs },
      'Failed to enqueue delayed autopost job',
    );
    throw error;
  }
}

/**
 * Get queue statistics
 * Useful for monitoring and debugging
 */
export async function getAutopostQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      autopostQueue.getWaitingCount(),
      autopostQueue.getActiveCount(),
      autopostQueue.getCompletedCount(),
      autopostQueue.getFailedCount(),
      autopostQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get autopost queue stats');
    throw error;
  }
}

/**
 * Remove a specific autopost job
 * Useful when a candidate is manually posted before the delay expires
 */
export async function removeAutopostJob(candidateId: string): Promise<void> {
  try {
    const jobId = `autopost-${candidateId}`;
    const job = await autopostQueue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info({ candidateId, jobId }, 'Autopost job removed');
    }
  } catch (error) {
    logger.error({ error, candidateId }, 'Failed to remove autopost job');
    // Don't throw - this is not critical
  }
}
