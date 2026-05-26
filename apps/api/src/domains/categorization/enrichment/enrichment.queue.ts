import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';

import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { redis } from '../../../lib/redis.js';
import { withJobTelemetry } from '../../../shared/telemetry/request-context.js';
import { getLogger } from '../../../shared/utils/logger.js';
import { enrichmentJobDataSchema } from './enrichment.types.js';

import type { EnrichmentJobData } from './enrichment.types.js';

const logger = getLogger({ component: 'enrichment-queue' });

/**
 * Queue for bank transaction enrichment jobs
 *
 * Processes raw bank transactions to generate enriched feature sets
 * for categorization and ML training
 */

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 200 }, // Keep for 24h
  removeOnFail: { age: 172800, count: 200 }, // Keep failures for 48h
  priority: 3, // Medium priority
};

export const ENRICHMENT_QUEUE_NAME = 'bank-transactions-enrichment';

export const enrichmentQueue = new Queue<EnrichmentJobData>(
  ENRICHMENT_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: DEFAULTS,
  },
);

/**
 * Enqueue transaction enrichment job
 * Supports batching multiple transactions for the same company
 */
export async function enqueueTransactionEnrichment(
  jobs: EnrichmentJobData | EnrichmentJobData[],
): Promise<void> {
  const jobsArray = Array.isArray(jobs) ? jobs : [jobs];

  if (jobsArray.length === 0) {
    return;
  }

  // Validate all jobs
  const validatedJobs = jobsArray.map((job) => {
    const result = enrichmentJobDataSchema.safeParse(job);
    if (!result.success) {
      logger.error({ error: result.error, job }, 'Invalid enrichment job data');
      throw new Error(`Invalid enrichment job data: ${result.error.message}`);
    }
    return result.data;
  });

  // Group jobs by company to optimize processing
  const jobsByCompany = new Map<string, EnrichmentJobData[]>();
  for (const job of validatedJobs) {
    const existing = jobsByCompany.get(job.companyId) || [];
    existing.push(job);
    jobsByCompany.set(job.companyId, existing);
  }

  // Enqueue one job per company (batched)
  for (const [companyId, companyJobs] of jobsByCompany) {
    // Merge all transaction IDs for this company
    const allTransactionIds = companyJobs.flatMap((j) => j.bankTransactionIds);

    // Deduplicate transaction IDs
    const uniqueTransactionIds = [...new Set(allTransactionIds)];

    if (uniqueTransactionIds.length === 0) {
      continue;
    }

    // Use first job's metadata
    const firstJob = companyJobs[0];

    const batchJob: EnrichmentJobData = {
      companyId,
      bankAccountId: firstJob.bankAccountId,
      bankTransactionIds: uniqueTransactionIds,
      source: firstJob.source,
    };

    // Use a deterministic job ID for deduplication
    // Format: enrichment-{companyId}-{timestamp}
    const jobId = `enrichment-${companyId}-${Date.now()}`;

    try {
      await executeQueueOperation(QueueName.ENRICHMENT, () =>
        enrichmentQueue.add('enrich-transactions', withJobTelemetry(batchJob), {
          jobId,
          priority:
            firstJob.source === 'manual'
              ? 1
              : firstJob.source === 'ingestion'
                ? 2
                : 3,
        }),
      );

      logger.info(
        {
          companyId,
          transactionCount: uniqueTransactionIds.length,
          source: firstJob.source,
        },
        'Enrichment job enqueued',
      );
    } catch (error) {
      logger.error(
        { error, companyId, transactionCount: uniqueTransactionIds.length },
        'Failed to enqueue enrichment job',
      );
      throw error;
    }
  }
}

/**
 * Get queue statistics
 * Useful for monitoring and debugging
 */
export async function getEnrichmentQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      enrichmentQueue.getWaitingCount(),
      enrichmentQueue.getActiveCount(),
      enrichmentQueue.getCompletedCount(),
      enrichmentQueue.getFailedCount(),
      enrichmentQueue.getDelayedCount(),
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
    logger.error({ error }, 'Failed to get enrichment queue stats');
    throw error;
  }
}

/**
 * Drain queue (remove all jobs)
 * Use with caution - primarily for testing
 */
export async function drainEnrichmentQueue(): Promise<void> {
  try {
    await enrichmentQueue.drain(true); // Remove all jobs including delayed
    logger.warn('Enrichment queue drained');
  } catch (error) {
    logger.error({ error }, 'Failed to drain enrichment queue');
    throw error;
  }
}

/**
 * Pause enrichment queue
 * Useful for maintenance operations
 */
export async function pauseEnrichmentQueue(): Promise<void> {
  try {
    await enrichmentQueue.pause();
    logger.info('Enrichment queue paused');
  } catch (error) {
    logger.error({ error }, 'Failed to pause enrichment queue');
    throw error;
  }
}

/**
 * Resume enrichment queue
 */
export async function resumeEnrichmentQueue(): Promise<void> {
  try {
    await enrichmentQueue.resume();
    logger.info('Enrichment queue resumed');
  } catch (error) {
    logger.error({ error }, 'Failed to resume enrichment queue');
    throw error;
  }
}
