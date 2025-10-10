import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';

/**
 * Queue for balance recalculation jobs
 *
 * Handles recalculation of both GL and bank account balances.
 * Ensures deduplication and efficient processing of balance updates.
 */

export interface GLBalanceJobData {
  type: 'gl-balance';
  companyId: string;
  coaId: string;
  recalcFrom: string; // ISO date string (earliest affected date)
  triggeredBy: 'ledger_entry' | 'backfill' | 'soft_delete' | 'manual';
}

export interface BankBalanceJobData {
  type: 'bank-balance';
  companyId: string;
  bankAccountId: string;
  recalcFrom: string; // ISO date string (earliest affected date)
  triggeredBy: 'transaction' | 'sync' | 'csv_upload' | 'soft_delete' | 'manual';
}

export type BalanceJobData = GLBalanceJobData | BankBalanceJobData;

export const balanceRecalcQueue = new Queue<BalanceJobData>('balance-recalc', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5s, then 10s, then 20s
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 172800, // Keep failed jobs for 48 hours
      count: 100, // Keep last 100 failed jobs
    },
  },
});

/**
 * Enqueue GL balance recalculation with deduplication
 * Uses jobId to ensure only one job per (company, coa) pair
 */
export async function enqueueGLBalance(data: Omit<GLBalanceJobData, 'type'>) {
  const jobData: GLBalanceJobData = { ...data, type: 'gl-balance' };
  const jobId = `gl-${data.companyId}-${data.coaId}`;

  // Check for existing job and keep the earlier recalcFrom date
  const existingJob = await balanceRecalcQueue.getJob(jobId);
  if (existingJob && existingJob.data.type === 'gl-balance') {
    const existingData = existingJob.data as GLBalanceJobData;
    if (existingData.recalcFrom <= data.recalcFrom) {
      // Existing job already covers this date range
      console.log(
        `GL balance job already queued for company ${data.companyId}, COA ${data.coaId} from ${existingData.recalcFrom}`,
      );
      return existingJob;
    }
    // Update the existing job to use the earlier date
    await existingJob.remove();
    jobData.recalcFrom = existingData.recalcFrom;
    console.log(
      `Updated GL balance job for company ${data.companyId}, COA ${data.coaId} to start from ${jobData.recalcFrom}`,
    );
  }

  return balanceRecalcQueue.add('gl-balance', jobData, {
    jobId,
    priority: data.triggeredBy === 'manual' ? 10 : 0, // Higher priority for manual triggers
  });
}

/**
 * Enqueue bank balance recalculation with deduplication
 * Uses jobId to ensure only one job per (company, bank_account) pair
 */
export async function enqueueBankBalance(
  data: Omit<BankBalanceJobData, 'type'>,
) {
  const jobData: BankBalanceJobData = { ...data, type: 'bank-balance' };
  const jobId = `bank-${data.companyId}-${data.bankAccountId}`;

  // Check for existing job and keep the earlier recalcFrom date
  const existingJob = await balanceRecalcQueue.getJob(jobId);
  if (existingJob && existingJob.data.type === 'bank-balance') {
    const existingData = existingJob.data as BankBalanceJobData;
    if (existingData.recalcFrom <= data.recalcFrom) {
      // Existing job already covers this date range
      console.log(
        `Bank balance job already queued for company ${data.companyId}, account ${data.bankAccountId} from ${existingData.recalcFrom}`,
      );
      return existingJob;
    }
    // Update the existing job to use the earlier date
    await existingJob.remove();
    jobData.recalcFrom = existingData.recalcFrom;
    console.log(
      `Updated bank balance job for company ${data.companyId}, account ${data.bankAccountId} to start from ${jobData.recalcFrom}`,
    );
  }

  return balanceRecalcQueue.add('bank-balance', jobData, {
    jobId,
    priority: data.triggeredBy === 'manual' ? 10 : 0, // Higher priority for manual triggers
  });
}

/**
 * Get queue statistics
 */
export async function getBalanceRecalcQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    balanceRecalcQueue.getWaiting(),
    balanceRecalcQueue.getActive(),
    balanceRecalcQueue.getCompleted(),
    balanceRecalcQueue.getFailed(),
    balanceRecalcQueue.getDelayed(),
  ]);

  const glJobs = [...waiting, ...active, ...delayed].filter(
    (job) => job.data.type === 'gl-balance',
  );
  const bankJobs = [...waiting, ...active, ...delayed].filter(
    (job) => job.data.type === 'bank-balance',
  );

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length,
    total:
      waiting.length +
      active.length +
      completed.length +
      failed.length +
      delayed.length,
    byType: {
      gl: glJobs.length,
      bank: bankJobs.length,
    },
  };
}

/**
 * Clear all completed and failed jobs (for maintenance)
 */
export async function cleanupBalanceRecalcQueue() {
  try {
    // Clean completed jobs older than 24 hours
    const completedCleaned = await balanceRecalcQueue.clean(
      24 * 60 * 60 * 1000,
      1000,
      'completed',
    );

    // Clean failed jobs older than 48 hours
    const failedCleaned = await balanceRecalcQueue.clean(
      48 * 60 * 60 * 1000,
      1000,
      'failed',
    );

    console.log(
      `Balance recalc queue cleanup: ${completedCleaned.length} completed, ${failedCleaned.length} failed jobs removed`,
    );

    return {
      completedCleaned: completedCleaned.length,
      failedCleaned: failedCleaned.length,
    };
  } catch (error) {
    console.error('Failed to cleanup balance recalc queue:', error);
    return { completedCleaned: 0, failedCleaned: 0 };
  }
}
