// import { Worker } from 'bullmq';
// import { redis } from '../../lib/redis.js';
// import type { Job } from 'bullmq';
// import pino from 'pino';
// import type {
//   BalanceJobData,
//   GLBalanceJobData,
//   BankBalanceJobData,
// } from '../queues/balance-recalc.queue.js';
// import { glBalanceService } from '../../domains/balances/gl-balance.service.js';
// import { bankBalanceService } from '../../domains/balances/bank-balance.service.js';

// const logger = pino();

// /**
//  * Balance recalculation worker
//  *
//  * Processes GL and bank balance recalculation jobs.
//  * Ensures accurate current and historical balance snapshots.
//  */

// // Optimized worker settings for balance recalculation
// const BALANCE_RECALC_WORKER_OPTIONS = {
//   connection: redis,
//   concurrency: Number(process.env.BALANCE_RECALC_CONCURRENCY) || 5, // Process 5 balance recalcs simultaneously
//   drainDelay: 300, // Wait 5 seconds when queue is empty
//   stalledInterval: 60000, // Check stalled jobs every minute
//   maxStalledCount: 2, // Allow 2 retries for stalled jobs
//   lockDuration: 60000, // 1 minute job lock
//   lockRenewTime: 30000, // Renew lock every 30 seconds
// };

// // Balance recalculation job processor
// async function processBalanceRecalcJob(job: Job<BalanceJobData>) {
//   const startTime = Date.now();

//   logger.info(
//     {
//       jobId: job.id,
//       jobName: job.name,
//       jobData: job.data,
//     },
//     'Starting balance recalculation job',
//   );

//   try {
//     // Track progress for long-running jobs
//     await job.updateProgress(0);

//     switch (job.name) {
//       case 'gl-balance': {
//         const data = job.data as GLBalanceJobData;
//         await processGLBalance(job, data);
//         break;
//       }

//       case 'bank-balance': {
//         const data = job.data as BankBalanceJobData;
//         await processBankBalance(job, data);
//         break;
//       }

//       default:
//         throw new Error(`Unknown balance recalc job: ${job.name}`);
//     }

//     const duration = Date.now() - startTime;
//     logger.info(
//       {
//         jobId: job.id,
//         jobName: job.name,
//         duration,
//       },
//       'Balance recalculation job completed',
//     );

//     await job.updateProgress(100);
//   } catch (error) {
//     const duration = Date.now() - startTime;
//     logger.error(
//       {
//         jobId: job.id,
//         jobName: job.name,
//         error: error instanceof Error ? error.message : error,
//         stack: error instanceof Error ? error.stack : undefined,
//         duration,
//       },
//       'Balance recalculation job failed',
//     );

//     throw error;
//   }
// }

// async function processGLBalance(
//   job: Job<GLBalanceJobData>,
//   data: GLBalanceJobData,
// ) {
//   logger.info(
//     {
//       companyId: data.companyId,
//       coaId: data.coaId,
//       recalcFrom: data.recalcFrom,
//       triggeredBy: data.triggeredBy,
//     },
//     'Processing GL balance recalculation',
//   );

//   await job.updateProgress(10);

//   try {
//     // Delegate to GL balance service
//     const result = await glBalanceService.recalculateBalance({
//       companyId: data.companyId,
//       coaId: data.coaId,
//       recalcFrom: data.recalcFrom,
//       triggeredBy: data.triggeredBy,
//     });

//     await job.updateProgress(90);

//     logger.info(
//       {
//         companyId: data.companyId,
//         coaId: data.coaId,
//         daysProcessed: result.daysProcessed,
//         finalBalance: result.finalBalance,
//       },
//       'GL balance recalculation completed',
//     );

//     return result;
//   } catch (error) {
//     logger.error(
//       {
//         companyId: data.companyId,
//         coaId: data.coaId,
//         error: error instanceof Error ? error.message : error,
//       },
//       'GL balance recalculation failed',
//     );
//     throw error;
//   }
// }

// async function processBankBalance(
//   job: Job<BankBalanceJobData>,
//   data: BankBalanceJobData,
// ) {
//   logger.info(
//     {
//       companyId: data.companyId,
//       bankAccountId: data.bankAccountId,
//       recalcFrom: data.recalcFrom,
//       triggeredBy: data.triggeredBy,
//     },
//     'Processing bank balance recalculation',
//   );

//   await job.updateProgress(10);

//   try {
//     // Delegate to bank balance service
//     const result = await bankBalanceService.recalculateBalance({
//       companyId: data.companyId,
//       bankAccountId: data.bankAccountId,
//       recalcFrom: data.recalcFrom,
//       triggeredBy: data.triggeredBy,
//     });

//     await job.updateProgress(90);

//     logger.info(
//       {
//         companyId: data.companyId,
//         bankAccountId: data.bankAccountId,
//         daysProcessed: result.daysProcessed,
//         finalBalance: result.finalBalance,
//       },
//       'Bank balance recalculation completed',
//     );

//     return result;
//   } catch (error) {
//     logger.error(
//       {
//         companyId: data.companyId,
//         bankAccountId: data.bankAccountId,
//         error: error instanceof Error ? error.message : error,
//       },
//       'Bank balance recalculation failed',
//     );
//     throw error;
//   }
// }

// // Create and export the worker
// export function startBalanceRecalcWorker(): Worker<BalanceJobData> {
//   const worker = new Worker<BalanceJobData>(
//     'balance-recalc',
//     processBalanceRecalcJob,
//     BALANCE_RECALC_WORKER_OPTIONS,
//   );

//   // Event handlers for monitoring
//   worker.on('completed', (job) => {
//     logger.info(
//       {
//         jobId: job.id,
//         jobName: job.name,
//         returnValue: job.returnvalue,
//       },
//       'Balance recalc job completed',
//     );
//   });

//   worker.on('failed', (job, error) => {
//     logger.error(
//       {
//         jobId: job?.id,
//         jobName: job?.name,
//         error: error.message,
//       },
//       'Balance recalc job failed',
//     );
//   });

//   worker.on('error', (error) => {
//     logger.error(
//       {
//         error: error.message,
//       },
//       'Balance recalc worker error',
//     );
//   });

//   worker.on('stalled', (jobId) => {
//     logger.warn(
//       {
//         jobId,
//       },
//       'Balance recalc job stalled',
//     );
//   });

//   return worker;
// }
