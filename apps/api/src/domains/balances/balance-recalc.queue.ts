import { createHash } from 'crypto';
import type { Job, JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';

import {
  executeQueueOperation,
  queueBroker,
  QueueName,
} from '../../jobs/queues/queue-broker.js';
import { redis } from '../../lib/redis.js';
import { isValidYMD } from '../../shared/utils/date.utils.js';

/**
 * Queue for balance recalculation jobs
 *
 * Handles recalculation of both GL and bank account balances.
 * Ensures deduplication and efficient processing of balance updates.
 */
const YMD = z.string().trim().refine(isValidYMD, 'Invalid YMD YYYY-MM-DD');

export const glBalanceJobDataSchema = z
  .object({
    type: z.literal('gl-balance'),
    companyId: z.string().trim().min(1),
    coaId: z.string().trim().min(1),
    recalcFrom: YMD,
    recalcTo: YMD.optional(),
    triggeredBy: z.enum(['ledger_entry', 'backfill', 'soft_delete', 'manual']),
    userId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.recalcTo && val.recalcFrom > val.recalcTo) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid range: ${val.recalcFrom} > ${val.recalcTo}`,
        path: ['recalcTo'],
      });
    }
  });
export type GLBalanceJobData = z.infer<typeof glBalanceJobDataSchema>;

export const bankBalanceJobDataSchema = z
  .object({
    type: z.literal('bank-balance'),
    companyId: z.string().trim().min(1),
    bankAccountId: z.string().trim().min(1),
    recalcFrom: YMD,
    recalcTo: YMD.optional(),
    triggeredBy: z.enum([
      'transaction',
      'sync',
      'csv_upload',
      'soft_delete',
      'manual',
      'opening_balance_calculated',
      'conversion_set',
    ]),
    userId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.recalcTo && val.recalcFrom > val.recalcTo) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid range: ${val.recalcFrom} > ${val.recalcTo}`,
        path: ['recalcTo'],
      });
    }
  });

export type BankBalanceJobData = z.infer<typeof bankBalanceJobDataSchema>;

export const BalanceJobDataSchema = z.discriminatedUnion('type', [
  glBalanceJobDataSchema,
  bankBalanceJobDataSchema,
]);

export type BalanceJobData = z.infer<typeof BalanceJobDataSchema>;

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 200 },
  removeOnFail: { age: 172800, count: 200 },
  priority: 5,
};

export const balanceRecalcQueue = new Queue<BalanceJobData>('balance-recalc', {
  connection: redis,
  defaultJobOptions: DEFAULTS,
});

function rangeHash(from: string, to?: string): string {
  return createHash('sha1')
    .update(`${from}|${to ?? ''}`)
    .digest('hex')
    .slice(0, 10);
}

function mergeRanges(
  aFrom: string,
  aTo?: string,
  bFrom?: string,
  bTo?: string,
): { from: string; to?: string } {
  if (!bFrom) {
    throw new Error('mergeRanges requires bFrom to be defined');
  }

  const from = aFrom < bFrom ? aFrom : bFrom;
  const to = aTo && bTo ? (aTo > bTo ? aTo : bTo) : (aTo ?? bTo);

  // Safety check: ensure we didn't produce an invalid range
  if (to && from > to) {
    throw new Error(`mergeRanges produced invalid range: ${from}..${to}`);
  }

  return { from, to };
}

function priorityForGL(trigger: GLBalanceJobData['triggeredBy']): number {
  switch (trigger) {
    case 'manual':
      return 10;
    case 'soft_delete':
      return 7;
    case 'ledger_entry':
      return 5;
    case 'backfill':
      return 2;
    default:
      return 5;
  }
}

function priorityForBank(trigger: BankBalanceJobData['triggeredBy']): number {
  switch (trigger) {
    case 'manual':
      return 10;
    case 'opening_balance_calculated':
      return 8;
    case 'transaction':
      return 6;
    case 'sync':
      return 5;
    case 'csv_upload':
      return 5;
    case 'soft_delete':
      return 7;
    case 'conversion_set':
      return 6;
    default:
      return 5;
  }
}

// Intentionally exclude 'active' and 'stalled' to avoid in-flight mutation races.
const MERGEABLE_STATES = new Set([
  'waiting',
  'delayed',
  'paused',
  'waiting-children',
]);
const isMergeableState = (s: string) => MERGEABLE_STATES.has(s);

/**
 * Enqueue GL balance recalculation with deduplication
 * Uses jobId to ensure only one job per (company, coa) pair
 * Returns null if queues are disabled
 */
export async function enqueueGLBalance(
  data: Omit<GLBalanceJobData, 'type'>,
): Promise<Job<GLBalanceJobData> | null> {
  // In test/disabled-queue mode, skip Redis lookups entirely.
  if (!queueBroker.shouldExecute()) {
    return null;
  }

  // Add type field for validation
  const dataWithType = { ...data, type: 'gl-balance' as const };
  const v = glBalanceJobDataSchema.safeParse(dataWithType);
  if (!v.success) {
    throw new Error(
      v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }

  const { companyId, coaId, recalcFrom, recalcTo } = v.data;
  const jobId = `gl-${companyId}-${coaId}`;

  // Check for existing job and merge or create follow-up as needed
  const existing = await balanceRecalcQueue.getJob(jobId);

  if (existing && existing.data.type === 'gl-balance') {
    const ex = glBalanceJobDataSchema.parse(existing.data);
    const state = await existing.getState();

    if (isMergeableState(state)) {
      const merged = mergeRanges(
        ex.recalcFrom,
        ex.recalcTo,
        recalcFrom,
        recalcTo,
      );
      const updatedData: GLBalanceJobData = {
        ...ex,
        recalcFrom: merged.from,
        recalcTo: merged.to,
      };

      // Cast to any to work around BullMQ's type limitation with discriminated unions
      // The updateData method creates an impossible intersection type for union types
      await (existing as any).updateData(updatedData);

      return existing as Job<GLBalanceJobData>;
    }

    if (state === 'active') {
      // If new range extends earlier/later than the running job, enqueue a follow-up job
      const extendsEarlier = recalcFrom < ex.recalcFrom;
      const extendsLater =
        (recalcTo ?? recalcFrom) > (ex.recalcTo ?? ex.recalcFrom);

      if (extendsEarlier || extendsLater) {
        // Compute the extended range that needs to be covered
        const merged = mergeRanges(
          ex.recalcFrom,
          ex.recalcTo,
          recalcFrom,
          recalcTo,
        );

        // Use deterministic hash to prevent duplicate follow-up jobs for the same range
        const hash = rangeHash(merged.from, merged.to);
        const followupId = `gl-${companyId}-${coaId}-followup-${hash}`;

        const job = await executeQueueOperation(QueueName.BALANCE_RECALC, () =>
          balanceRecalcQueue.add(
            'gl-balance',
            {
              ...data,
              type: 'gl-balance',
              recalcFrom: merged.from,
              recalcTo: merged.to,
            },
            { jobId: followupId, priority: priorityForGL(v.data.triggeredBy) },
          ),
        );
        return job as Job<GLBalanceJobData> | null;
      }
      return existing as Job<GLBalanceJobData>; // already covered by the running job
    }

    // For completed/failed/unknown states, fall through to create new job
  }

  const job = await executeQueueOperation(QueueName.BALANCE_RECALC, () =>
    balanceRecalcQueue.add(
      'gl-balance',
      { ...data, type: 'gl-balance', recalcFrom, recalcTo },
      { jobId, priority: priorityForGL(v.data.triggeredBy) },
    ),
  );
  return job as Job<GLBalanceJobData> | null;
}

/**
 * Enqueue bank balance recalculation with deduplication
 * Uses jobId to ensure only one job per (company, bank_account) pair
 * Returns null if queues are disabled
 */
export async function enqueueBankBalance(
  data: Omit<BankBalanceJobData, 'type'>,
): Promise<Job<BankBalanceJobData> | null> {
  // In test/disabled-queue mode, skip Redis lookups entirely.
  if (!queueBroker.shouldExecute()) {
    return null;
  }

  // Add type field for validation
  const dataWithType = { ...data, type: 'bank-balance' as const };
  const v = bankBalanceJobDataSchema.safeParse(dataWithType);
  if (!v.success) {
    throw new Error(v.error.issues.join(', '));
  }

  const { companyId, bankAccountId, recalcFrom, recalcTo } = v.data;
  const jobId = `bank-${companyId}-${bankAccountId}`;

  // Check for existing job and merge or create follow-up as needed
  const existing = await balanceRecalcQueue.getJob(jobId);

  if (existing && existing.data.type === 'bank-balance') {
    const ex = bankBalanceJobDataSchema.parse(existing.data);
    const state = await existing.getState();

    if (isMergeableState(state)) {
      const merged = mergeRanges(
        ex.recalcFrom,
        ex.recalcTo,
        recalcFrom,
        recalcTo,
      );
      const updatedData: BankBalanceJobData = {
        ...ex,
        recalcFrom: merged.from,
        recalcTo: merged.to,
      };

      // Cast to any to work around BullMQ's type limitation with discriminated unions
      // The updateData method creates an impossible intersection type for union types
      await (existing as any).updateData(updatedData);

      return existing as Job<BankBalanceJobData>;
    }

    if (state === 'active') {
      // If new range extends earlier/later than the running job, enqueue a follow-up job
      const extendsEarlier = recalcFrom < ex.recalcFrom;
      const extendsLater =
        (recalcTo ?? recalcFrom) > (ex.recalcTo ?? ex.recalcFrom);

      if (extendsEarlier || extendsLater) {
        // Compute the extended range that needs to be covered
        const merged = mergeRanges(
          ex.recalcFrom,
          ex.recalcTo,
          recalcFrom,
          recalcTo,
        );

        // Use deterministic hash to prevent duplicate follow-up jobs for the same range
        const hash = rangeHash(merged.from, merged.to);
        const followupId = `bank-${companyId}-${bankAccountId}-followup-${hash}`;

        const job = await executeQueueOperation(QueueName.BALANCE_RECALC, () =>
          balanceRecalcQueue.add(
            'bank-balance',
            {
              ...data,
              type: 'bank-balance',
              recalcFrom: merged.from,
              recalcTo: merged.to,
            },
            {
              jobId: followupId,
              priority: priorityForBank(v.data.triggeredBy),
            },
          ),
        );
        return job as Job<BankBalanceJobData> | null;
      }
      return existing as Job<BankBalanceJobData>; // already covered by the running job
    }

    // For completed/failed/unknown states, fall through to create new job
  }

  const job = await executeQueueOperation(QueueName.BALANCE_RECALC, () =>
    balanceRecalcQueue.add(
      'bank-balance',
      { ...data, type: 'bank-balance', recalcFrom, recalcTo },
      { jobId, priority: priorityForBank(v.data.triggeredBy) },
    ),
  );
  return job as Job<BankBalanceJobData> | null;
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
