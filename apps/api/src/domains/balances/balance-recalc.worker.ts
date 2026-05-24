import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';

import { ENV } from '../../config/env.js';
import { redis } from '../../lib/redis.js';
import { runWithJobContext } from '../../shared/telemetry/request-context.js';
import { getLogger } from '../../shared/utils/logger.js';
import {
  bankBalanceJobDataSchema,
  glBalanceJobDataSchema,
} from './balance-recalc.queue.js';
import { bankBalanceService } from './bank-balance.service.js';
import { glBalanceService } from './gl-balance.service.js';

import type {
  BalanceJobData,
  BankBalanceJobData,
  GLBalanceJobData,
} from './balance-recalc.queue.js';

const logger = getLogger({
  component: 'balance-recalc-worker',
  processSource: 'worker',
});

/**
 * Balance recalculation worker
 *
 * Processes GL and bank balance recalculation jobs.
 * Ensures accurate current and historical balance snapshots.
 */

// Optimized worker settings for balance recalculation
const BALANCE_RECALC_WORKER_OPTIONS = {
  connection: redis,
  concurrency: Number(ENV.BALANCE_RECALC_CONCURRENCY) || 5, // Process 5 balance recalcs simultaneously
  drainDelay: 300, // Wait 5 seconds when queue is empty
  stalledInterval: 60000, // Check stalled jobs every minute
  maxStalledCount: 2, // Allow 2 retries for stalled jobs
  lockDuration: 60000, // 1 minute job lock
  lockRenewTime: 30000, // Renew lock every 30 seconds
};

// Helper to create redacted summary for logging
function getJobSummary(data: BalanceJobData): Record<string, unknown> {
  if (data.type === 'gl-balance') {
    return {
      type: data.type,
      companyId: data.companyId,
      coaId: data.coaId,
    };
  }
  if (data.type === 'bank-balance') {
    return {
      type: data.type,
      companyId: data.companyId,
      bankAccountId: data.bankAccountId,
    };
  }
  return { type: (data as any)?.type };
}

// Balance recalculation job processor
async function processBalanceRecalcJob(job: Job<BalanceJobData>) {
  const startTime = Date.now();
  const summary = getJobSummary(job.data);

  logger.info(
    { jobId: job.id, jobName: job.name, ...summary },
    'Starting balance recalculation job',
  );

  try {
    await job.updateProgress(0);

    // Validate and process based on job type using discriminated union
    if (job.data.type === 'gl-balance') {
      const v = glBalanceJobDataSchema.safeParse(job.data);
      if (!v.success) {
        logger.error(
          { jobId: job.id, issues: v.error.issues },
          'GL job validation failed',
        );
        throw new Error(
          v.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        );
      }
      await processGLBalance(job as Job<GLBalanceJobData>, v.data);
    } else if (job.data.type === 'bank-balance') {
      const v = bankBalanceJobDataSchema.safeParse(job.data);
      if (!v.success) {
        logger.error(
          { jobId: job.id, issues: v.error.issues },
          'Bank job validation failed',
        );
        throw new Error(
          v.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        );
      }
      await processBankBalance(job as Job<BankBalanceJobData>, v.data);
    } else {
      throw new Error(
        `Unknown balance recalc job type: ${(job.data as any).type}`,
      );
    }

    await job.updateProgress(100);
    const ms = Date.now() - startTime;
    logger.info(
      { jobId: job.id, jobName: job.name, ms, ...summary },
      'Balance recalculation job completed',
    );
  } catch (error) {
    const ms = Date.now() - startTime;
    logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        ms,
        ...summary,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Balance recalculation job failed',
    );

    throw error;
  }
}

async function processGLBalance(
  job: Job<GLBalanceJobData>,
  data: GLBalanceJobData,
) {
  const traceId = randomUUID();
  const range = `${data.recalcFrom}..${data.recalcTo ?? 'open'}`;

  logger.info(
    {
      traceId,
      companyId: data.companyId,
      coaId: data.coaId,
      range,
      triggeredBy: data.triggeredBy,
    },
    'GL balance recalculation start',
  );

  await job.updateProgress(20);

  try {
    // Delegate to GL balance service
    const result = await glBalanceService.recalculateBalance({
      companyId: data.companyId,
      coaId: data.coaId,
      recalcFrom: data.recalcFrom,
      recalcTo: data.recalcTo,
      triggeredBy: data.triggeredBy,
    });

    await job.updateProgress(90);

    logger.info(
      {
        traceId,
        companyId: data.companyId,
        coaId: data.coaId,
        daysProcessed: result.daysProcessed,
        snapshotsCreated: result.snapshotsCreated,
        finalBalance: result.finalBalance,
        lastProcessedDate: result.lastProcessedDate,
      },
      'GL balance recalculation completed',
    );

    return result;
  } catch (error) {
    logger.error(
      {
        traceId,
        companyId: data.companyId,
        coaId: data.coaId,
        error: error instanceof Error ? error.message : String(error),
      },
      'GL balance recalculation failed',
    );
    throw error;
  }
}

async function processBankBalance(
  job: Job<BankBalanceJobData>,
  data: BankBalanceJobData,
) {
  const traceId = randomUUID();
  const range = `${data.recalcFrom}..${data.recalcTo ?? 'open'}`;

  logger.info(
    {
      traceId,
      companyId: data.companyId,
      bankAccountId: data.bankAccountId,
      range,
      triggeredBy: data.triggeredBy,
    },
    'Bank balance recalculation start',
  );

  await job.updateProgress(20);

  try {
    // Delegate to bank balance service
    const result = await bankBalanceService.recalculateBalance({
      companyId: data.companyId,
      bankAccountId: data.bankAccountId,
      recalcFrom: data.recalcFrom,
      recalcTo: data.recalcTo,
      triggeredBy: data.triggeredBy,
      userId: data.userId,
    });

    await job.updateProgress(90);

    logger.info(
      {
        traceId,
        companyId: data.companyId,
        bankAccountId: data.bankAccountId,
        daysProcessed: result.daysProcessed,
        snapshotsCreated: result.snapshotsCreated,
        finalBalance: result.finalBalance,
        lastProcessedDate: result.lastProcessedDate,
      },
      'Bank balance recalculation completed',
    );

    return result;
  } catch (error) {
    logger.error(
      {
        traceId,
        companyId: data.companyId,
        bankAccountId: data.bankAccountId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Bank balance recalculation failed',
    );
    throw error;
  }
}

// Create and export the worker
export function startBalanceRecalcWorker(): Worker<BalanceJobData> {
  const worker = new Worker<BalanceJobData>(
    'balance-recalc',
    (job) => runWithJobContext(job, () => processBalanceRecalcJob(job)),
    BALANCE_RECALC_WORKER_OPTIONS,
  );

  // Event handlers for monitoring
  worker.on('completed', (job) => {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        returnValue: job.returnvalue,
      },
      'Balance recalc job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        error: error.message,
      },
      'Balance recalc job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error(
      {
        error: error.message,
      },
      'Balance recalc worker error',
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      {
        jobId,
      },
      'Balance recalc job stalled',
    );
  });

  return worker;
}
