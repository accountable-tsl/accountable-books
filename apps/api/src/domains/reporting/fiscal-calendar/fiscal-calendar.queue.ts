import { createHash } from 'crypto';
import type { JobsOptions } from 'bullmq';
import { Queue } from 'bullmq';

import {
  executeQueueOperation,
  QueueName,
} from '../../../jobs/queues/queue-broker.js';
import { redis } from '../../../lib/redis.js';
import { isValidYMD } from '../../../shared/utils/date.utils.js';

import type {
  AutoExtendJobData,
  FillCoverageGapsJobData,
  FiscalCalendarJobData,
  FiscalPeriodType,
  GenerateCalendarJobData,
} from './fiscal-calendar.types.js';

// Job priorities for different types of fiscal calendar operations
const PRIORITIES = {
  COMPANY_CREATION: 10,
  DATA_IMPORT: 7,
  AUTO_EXTEND: 3,
} as const;

const DEFAULT_PERIOD_TYPES: FiscalPeriodType[] = [
  'monthly',
  'quarterly',
  'yearly',
];
const ALLOWED_PERIOD_TYPES = new Set<FiscalPeriodType>(DEFAULT_PERIOD_TYPES);

function normalizeTypes(types?: FiscalPeriodType[]): FiscalPeriodType[] {
  const arr = (types && types.length ? types : DEFAULT_PERIOD_TYPES).filter(
    (t): t is FiscalPeriodType => ALLOWED_PERIOD_TYPES.has(t),
  );
  // stable order for jobId determinism
  const order = ['monthly', 'quarterly', 'yearly'];
  return Array.from(new Set(arr)).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
}

// dedupe check
async function jobExistsOrActive(
  q: Queue<any>,
  jobId: string,
): Promise<boolean> {
  const job = await q.getJob(jobId);
  if (!job) return false;
  const state = await job.getState();
  return [
    'active',
    'waiting',
    'delayed',
    'waiting-children',
    'paused',
  ].includes(state);
}

function shortHash(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 10);
}

/**
 * Queue for fiscal calendar management jobs
 *
 * Handles generation, extension, and gap-filling of fiscal calendar periods.
 * Ensures every company has complete, non-overlapping period coverage.
 */

export const fiscalCalendarQueue = new Queue<FiscalCalendarJobData>(
  'fiscal-calendar',
  {
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
  },
);

/**
 * Enqueue calendar generation job for a company
 * Called when a new company is created
 *
 * @param companyId - Company UUID
 * @param options - Generation options
 * @returns Job ID
 */
export async function enqueueFiscalCalendarGeneration(
  params: GenerateCalendarJobData,
): Promise<string> {
  const {
    companyId,
    yearsBack = 2,
    yearsForward = 10,
    periodTypes,
    triggeredBy = 'company_creation',
    userId,
  } = params;

  // Validate inputs
  if (!companyId) {
    throw new Error('companyId is required');
  }
  if (yearsBack < 0 || yearsBack > 10) {
    throw new Error('yearsBack must be 0-10');
  }
  if (yearsForward < 1 || yearsForward > 50) {
    throw new Error('yearsForward must be 1-50');
  }

  const jobId = `generate-${companyId}`;

  // Check if job already exists in any active/pending state
  if (await jobExistsOrActive(fiscalCalendarQueue, jobId)) {
    console.log(
      `Calendar generation job already exists for company ${companyId}`,
    );
    return jobId;
  }

  const job = await executeQueueOperation(QueueName.FISCAL_CALENDAR, () =>
    fiscalCalendarQueue.add(
      'generate-calendar',
      {
        type: 'generate-calendar',
        companyId,
        yearsBack,
        yearsForward,
        periodTypes: normalizeTypes(periodTypes),
        triggeredBy,
        userId,
      },
      {
        jobId,
        priority:
          triggeredBy === 'company_creation' ? PRIORITIES.COMPANY_CREATION : 5, // Higher priority for new companies
      } satisfies JobsOptions,
    ),
  );

  if (job) {
    console.log(
      `📅 Enqueued fiscal calendar generation for company ${companyId} (job: ${job.id})`,
    );
    return job.id!;
  }

  return 'disabled-job-id';
}

/**
 * Enqueue auto-extend job for a company
 * Called by nightly cron to maintain future coverage
 *
 * @param companyId - Company UUID
 * @param minFutureMonths - Minimum months of future coverage (default: 24)
 * @returns Job ID
 */
export async function enqueueAutoExtend(p: AutoExtendJobData): Promise<string> {
  const {
    companyId,
    minFutureMonths = 24,
    triggeredBy = 'scheduled',
    userId,
  } = p;
  // Validate inputs
  if (!companyId || (companyId !== 'all' && !companyId.trim())) {
    throw new Error('companyId is required');
  }
  if (minFutureMonths < 1 || minFutureMonths > 120) {
    throw new Error('minFutureMonths must be 1-120');
  }

  const jobId = `autoextend-${companyId}`;
  if (await jobExistsOrActive(fiscalCalendarQueue, jobId)) {
    console.log(`Auto-extend job already exists for company ${companyId}`);
    return jobId;
  }

  const job = await executeQueueOperation(QueueName.FISCAL_CALENDAR, () =>
    fiscalCalendarQueue.add(
      'auto-extend',
      {
        type: 'auto-extend',
        companyId,
        minFutureMonths,
        triggeredBy,
        userId,
      },
      {
        jobId,
        priority: PRIORITIES.AUTO_EXTEND,
      },
    ),
  );

  if (job) {
    console.log(
      `📅 Enqueued auto-extend for company ${companyId} (job: ${job.id})`,
    );
    return job.id!;
  }

  return 'disabled-job-id';
}

/**
 * Enqueue fill-coverage-gaps job
 * Called when importing old data or changing fiscal year settings
 *
 * @param companyId - Company UUID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param periodTypes - Period types to fill
 * @returns Job ID
 */
export async function enqueueFillCoverageGaps(
  p: FillCoverageGapsJobData,
): Promise<string> {
  const {
    companyId,
    startDate,
    endDate,
    periodTypes = DEFAULT_PERIOD_TYPES,
    triggeredBy = 'import',
    userId,
  } = p;

  // Validate inputs
  if (!companyId) {
    throw new Error('companyId is required');
  }
  if (!isValidYMD(startDate) || !isValidYMD(endDate) || startDate > endDate) {
    throw new Error(
      `enqueueFillCoverageGaps: invalid range ${startDate}..${endDate}`,
    );
  }

  const norm = normalizeTypes(periodTypes);
  const key = `${companyId}:${startDate}:${endDate}:${norm.join(',')}`;
  const jobId = `fill-${shortHash(key)}`;

  if (await jobExistsOrActive(fiscalCalendarQueue, jobId)) {
    console.log(
      `Fill-coverage-gaps job already exists for company ${companyId}, ${startDate} to ${endDate}`,
    );
    return jobId;
  }

  const job = await executeQueueOperation(QueueName.FISCAL_CALENDAR, () =>
    fiscalCalendarQueue.add(
      'fill-coverage-gaps',
      {
        type: 'fill-coverage-gaps',
        companyId,
        startDate,
        endDate,
        periodTypes: norm,
        triggeredBy,
        userId,
      },
      {
        jobId,
        priority: PRIORITIES.DATA_IMPORT,
      },
    ),
  );

  if (job) {
    console.log(
      `📅 Enqueued fill-coverage-gaps for company ${companyId}, ${startDate} to ${endDate} (job: ${job.id})`,
    );
    return job.id!;
  }

  return 'disabled-job-id';
}

/**
 * Schedule nightly auto-extend job for all active companies
 */
export async function scheduleNightlyAutoExtend(
  cronPattern = '0 2 * * *',
  tz = 'UTC',
): Promise<void> {
  // Add repeatable job that runs nightly at 2 AM
  await executeQueueOperation(QueueName.FISCAL_CALENDAR, () =>
    fiscalCalendarQueue.add(
      'nightly-auto-extend-all',
      {
        type: 'auto-extend',
        companyId: 'all',
        minFutureMonths: 24,
        triggeredBy: 'scheduled',
      } satisfies AutoExtendJobData,
      {
        repeat: {
          pattern: cronPattern, // Cron: 2 AM daily (default)
          tz, // Use UTC to avoid timezone confusion
        },
        jobId: 'nightly-auto-extend-scheduler',
        priority: PRIORITIES.AUTO_EXTEND,
      },
    ),
  );

  console.log(
    `📅 Scheduled nightly auto-extend job (${cronPattern} ${tz || ''})`,
  );
}

/**
 * Remove nightly auto-extend schedule
 */
export async function unscheduleNightlyAutoExtend(
  cronPattern = '0 2 * * *',
  tz = 'UTC',
): Promise<void> {
  await fiscalCalendarQueue.removeRepeatable('nightly-auto-extend-all', {
    pattern: cronPattern,
    tz,
  });

  console.log('📅 Unscheduled nightly auto-extend job');
}
