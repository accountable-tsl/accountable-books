import type { Knex } from 'knex';
import { Job, Worker } from 'bullmq';

import { knexClient } from '../../../db/knexClient.js';
import { redis } from '../../../lib/redis.js';
import { isValidYMD } from '../../../shared/utils/date.utils.js';
import logger from '../../../shared/utils/logger.js';
import { enqueueAutoExtend } from './fiscal-calendar.queue.js';
import { fiscalCalendarService } from './fiscal-calendar.service.js';

import type {
  FiscalCalendarJobData,
  FiscalPeriodType,
} from './fiscal-calendar.types.js';

const WORKER_CONCURRENCY = Number(process.env.FISCAL_CALENDAR_CONCURRENCY) || 3;
const PAGE_SIZE = 200;

const DEFAULT_PERIOD_TYPES: FiscalPeriodType[] = [
  'monthly',
  'quarterly',
  'yearly',
];
// const ALLOWED_TYPES = new Set<FiscalPeriodType>(PERIOD_ORDER);

// // Normalize requested period types to a deduped, stable order
// function normalizePeriodTypes(types?: FiscalPeriodType[]): FiscalPeriodType[] {
//   const arr = (types && types.length ? types : PERIOD_ORDER).filter((t) =>
//     ALLOWED_TYPES.has(t),
//   );
//   return Array.from(new Set(arr)).sort(
//     (a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b),
//   );
// }

// Simple 32-bit FNV-1a hash for advisory lock keys
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h | 0;
}

/**
 * Acquire pg_advisory_xact_lock(companyId, periodTypeOrAny) inside a DB transaction,
 * pass the transaction to the provided function, and auto-release on commit/rollback.
 * Acquire PostgreSQL advisory lock for company calendar operations
 * Prevents concurrent modifications to the same company's fiscal calendar
 */
async function withAdvisoryTxLock<T>(
  companyId: string,
  periodType: FiscalPeriodType | 'any',
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  return knexClient.transaction(async (trx) => {
    const k1 = hash32(`fiscal:${companyId}`);
    const k2 = hash32(`type:${periodType}`);
    await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [k1, k2]); // waits
    return fn(trx);
  });
}

/**
 * Process fiscal calendar jobs
 */
async function processFiscalCalendarJob(
  job: Job<FiscalCalendarJobData>,
): Promise<any> {
  const { data } = job;
  const jobId = job.id;

  logger.info(
    { jobId, type: data.type, companyId: data.companyId },
    '📅 Start fiscal calendar job',
  );

  try {
    switch (data.type) {
      case 'generate-calendar': {
        const yearsBack = data.yearsBack ?? 2;
        const yearsForward = data.yearsForward ?? 10;
        const periodTypes = DEFAULT_PERIOD_TYPES;

        const res = await withAdvisoryTxLock(data.companyId, 'any', (trx) =>
          fiscalCalendarService.generateCompanyFiscalCalendar({
            companyId: data.companyId,
            options: { yearsBack, yearsForward, periodTypes, status: 'open' },
            trx,
          }),
        );

        logger.info(
          {
            jobId,
            companyId: data.companyId,
            created: res.created,
            skipped: res.skipped,
            periodTypes,
          },
          'Generated fiscal calendar',
        );

        return {
          success: true,
          type: data.type,
          companyId: data.companyId,
          periodsCreated: res.created,
          periodsSkipped: res.skipped,
        };
      }

      case 'auto-extend': {
        // Special case: batch processing for all companies
        if (data.companyId === 'all') {
          const minFutureMonths = data.minFutureMonths ?? 24;

          let offset = 0;
          let total = 0;
          let enqueued = 0;

          while (true) {
            const batch = await knexClient('companies')
              .select('id')
              .where({ is_deleted: false })
              .limit(PAGE_SIZE)
              .offset(offset);

            if (batch.length === 0) break;

            total += batch.length;

            await Promise.all(
              batch.map((c) =>
                enqueueAutoExtend({
                  type: 'auto-extend',
                  companyId: c.id,
                  minFutureMonths,
                  triggeredBy: 'scheduled',
                }),
              ),
            );

            enqueued += batch.length;
            offset += batch.length;
          }

          logger.info(
            { jobId, total, enqueued, minFutureMonths },
            'Auto-extend fan-out complete',
          );

          return {
            success: true,
            type: 'auto-extend-all',
            companiesProcessed: total,
            jobsEnqueued: enqueued,
          };
        }

        // Single-company auto-extend (idempotent + serialized)
        const minFutureMonths = data.minFutureMonths ?? 24;

        const result = await withAdvisoryTxLock(data.companyId, 'any', (trx) =>
          fiscalCalendarService.ensureFutureCoverage({
            companyId: data.companyId,
            minFutureMonths,
            trx,
          }),
        );

        logger.info(
          {
            jobId,
            companyId: data.companyId,
            extended: result.extended,
            periodsAdded: result.periodsAdded,
            end: result.newCoverageEndDate,
          },
          result.extended ? 'Extended coverage' : 'Coverage already sufficient',
        );

        return {
          success: true,
          type: 'auto-extend',
          companyId: data.companyId,
          extended: result.extended,
          periodsAdded: result.periodsAdded,
          newCoverageEndDate: result.newCoverageEndDate,
        };
      }

      case 'fill-coverage-gaps': {
        const { startDate, endDate } = data;

        if (
          !isValidYMD(startDate) ||
          !isValidYMD(endDate) ||
          startDate > endDate
        ) {
          throw new Error(
            `fill-coverage-gaps: invalid range ${startDate}..${endDate}`,
          );
        }

        const periodTypes = data.periodTypes ?? DEFAULT_PERIOD_TYPES;
        const res = await withAdvisoryTxLock(data.companyId, 'any', (trx) =>
          fiscalCalendarService.fillCoverageGaps({
            companyId: data.companyId,
            startDate,
            endDate,
            periodTypes,
            trx,
          }),
        );

        logger.info(
          {
            jobId,
            companyId: data.companyId,
            startDate,
            endDate,
            filled: res.periodsFilled,
            periodTypes,
          },
          'Filled coverage gaps',
        );

        return {
          success: true,
          type: 'fill-coverage-gaps',
          companyId: data.companyId,
          periodsFilled: res.periodsFilled,
          dateRange: res.dateRange,
        };
      }

      default: {
        throw new Error(
          `Unknown fiscal calendar job type: ${(data as any).type}`,
        );
      }
    }
  } catch (error) {
    logger.error(
      {
        jobId,
        type: data.type,
        companyId: data.companyId,
        err: error instanceof Error ? error.message : String(error),
      },
      '❌ Fiscal calendar job failed',
    );
    throw error; // let BullMQ retry
  }
}

/**
 * Start fiscal calendar worker
 */
export function startFiscalCalendarWorker(
  concurrency: number = WORKER_CONCURRENCY,
): Worker {
  const worker = new Worker<FiscalCalendarJobData>(
    'fiscal-calendar',
    processFiscalCalendarJob,
    {
      connection: redis,
      concurrency,
      lockDuration: 5 * 60 * 1000, // 5 minutes
      stalledInterval: 60 * 1000, // check stalled jobs every 60s
      maxStalledCount: 2,
    },
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, type: job.data.type, companyId: job.data.companyId },
      'Fiscal calendar job completed',
    );
  });

  worker.on('failed', (job, error) =>
    logger.error(
      {
        jobId: job?.id,
        type: job?.data?.type,
        companyId: job?.data?.companyId,
        err: error instanceof Error ? error.message : String(error),
      },
      '❌ Job failed',
    ),
  );

  worker.on('stalled', (jobId) =>
    logger.warn({ jid: jobId }, '⚠️ Job stalled'),
  );

  worker.on('error', (error) =>
    logger.error({ err: error?.message }, '❌ Worker error'),
  );

  logger.info({ concurrency }, '📅 Fiscal calendar worker started');

  return worker;
}
