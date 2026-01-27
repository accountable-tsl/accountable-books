import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import pino from 'pino';

import { knexClient } from '../../../db/knexClient.js';
import { redis } from '../../../lib/redis.js';
import { emitTxnEnrichedEvent } from '../events/transaction-events.service.js';
import { incrementContactStats } from '../stats/stats.service.js';
import { logTaskEventSafe } from '../tasks/task-events.service.js';
import { upsertCategorizationTask } from '../tasks/tasks.service.js';
import { ENRICHMENT_QUEUE_NAME } from './enrichment.queue.js';
import { enrichTransaction } from './enrichment.service.js';
import { enrichmentJobDataSchema } from './enrichment.types.js';

import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import type {
  EnrichmentJobData,
  EnrichmentResult,
} from './enrichment.types.js';

const logger = pino();

/**
 * Bank Transaction Enrichment Worker
 *
 * Processes bank transactions to generate enriched feature sets
 * for categorization, ML training, and analytics
 */

const ENRICHMENT_WORKER_OPTIONS = {
  connection: redis,
  concurrency: Number(process.env.ENRICHMENT_WORKER_CONCURRENCY) || 10,
  drainDelay: 300, // Wait 5 seconds when queue is empty
  stalledInterval: 60000, // Check stalled jobs every minute
  maxStalledCount: 2, // Allow 2 retries for stalled jobs
  lockDuration: 120000, // 2 minute job lock (enrichment can be slow)
  lockRenewTime: 30000, // Renew lock every 30 seconds
};

/**
 * Process enrichment job
 * Iterates through batch of transaction IDs, enriching each one
 */
async function processEnrichmentJob(job: Job<EnrichmentJobData>) {
  const startTime = Date.now();

  logger.info(
    {
      jobId: job.id,
      companyId: job.data.companyId,
      transactionCount: job.data.bankTransactionIds.length,
      source: job.data.source,
    },
    'Starting enrichment job',
  );

  try {
    // Validate job data
    const validation = enrichmentJobDataSchema.safeParse(job.data);
    if (!validation.success) {
      logger.error(
        { jobId: job.id, issues: validation.error.issues },
        'Enrichment job validation failed',
      );
      throw new Error(
        `Invalid job data: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      );
    }

    const { companyId, bankTransactionIds: bIds, source } = validation.data;

    const bankTransactionIdSet = new Set(bIds);
    const bankTransactionIds = [...bankTransactionIdSet];

    // Track successes and failures
    const results: {
      successes: EnrichmentResult[];
      failures: EnrichmentResult[];
    } = {
      successes: [],
      failures: [],
    };

    // Legacy unsorted processing retained for reference.
    // for (...) { ... }

    // Fetch transaction dates for deterministic ordering
    const transactionRows = await knexClient('bank_transactions')
      .select('id', 'date')
      .whereIn('id', bankTransactionIds);

    const dateLookup = new Map<string, string>();
    for (const row of transactionRows) {
      dateLookup.set(row.id, row.date);
    }

    const sortedTransactionIds = [...bankTransactionIds].sort((a, b) => {
      const dateA = dateLookup.get(a);
      const dateB = dateLookup.get(b);
      if (dateA && dateB) {
        if (dateA === dateB) {
          return a.localeCompare(b);
        }
        return dateA.localeCompare(dateB);
      }
      if (dateA) return -1;
      if (dateB) return 1;
      return a.localeCompare(b);
    });

    // Process each transaction in the batch deterministically
    const totalTransactions = sortedTransactionIds.length;

    for (let i = 0; i < sortedTransactionIds.length; i++) {
      const bankTransactionId = sortedTransactionIds[i];

      try {
        const progress = Math.floor(((i + 1) / totalTransactions) * 100);
        await job.updateProgress(progress);

        logger.debug(
          {
            jobId: job.id,
            bankTransactionId,
            progress: `${i + 1}/${totalTransactions}`,
          },
          'Processing transaction',
        );

        const transactionStartTime = Date.now();

        let eventData: TransactionEnrichedEventData | null = null;
        const runId = randomUUID();

        await knexClient.transaction(async (trx) => {
          const result = await enrichTransaction({
            bankTransactionId,
            taskSource: source,
            trx,
          });

          if (!result.success || !result.enrichedTransaction) {
            throw new Error(
              result.error ||
                `Enrichment failed without explicit error for ${bankTransactionId}`,
            );
          }

          const enrichedTransaction = result.enrichedTransaction;
          const companyUUID = enrichedTransaction.context.company_uuid;
          const bankTransactionDate = enrichedTransaction.raw.date;
          const contactFingerprint =
            result.enrichedTransaction.normalized.contact_fingerprint;

          const persistOutcome = await persistEnrichedTransaction(
            {
              company_uuid: result.enrichedTransaction.context.company_uuid,
              bank_transaction_id: bankTransactionId,
              bank_transaction_date: bankTransactionDate,
              enriched_transaction: enrichedTransaction,
              enrichment_version: String(enrichedTransaction.version),
              source,
              checksum: result.checksum,
              jobId: job.id || undefined,
              trx,
            },

            // “didPersist” ensures we only revisit stats when the enriched payload actually changed,
            // stats entries table ensures that reprocessing the same bank transaction can’t inflate counts or amounts

            // companyId,
            // bankTransactionId,
            // result.enrichedTransaction,
            // source,
            // job.id || undefined,
            // trx,
            // {
            //   checksum,
            //   statsSnapshotChecksum:
            //     result.statsContext?.snapshotChecksum || null,
            // },
          );

          if (
            result.success &&
            contactFingerprint &&
            persistOutcome.didPersist &&
            result.statsContext
          ) {
            await incrementContactStats(
              {
                ...result.enrichedTransaction.raw,
                amount_native: result.enrichedTransaction.raw.amount,
                system_ex_rate: result.statsContext.exchange_rate,
                amount_reporting: result.statsContext.amount_reporting,
                ...result.enrichedTransaction.normalized,
                company_uuid: companyUUID,
                contact_fingerprint: contactFingerprint,
                bank_transaction_id: bankTransactionId,
                bank_transaction_date: bankTransactionDate,
                stats_replay_seq: result.statsContext.stats_replay_seq,
                stats_snapshot_checksum:
                  result.statsContext.stats_snapshot_checksum,
              },
              trx,
            );
          }

          if (persistOutcome.didPersist) {
            eventData = {
              company_uuid: companyUUID,
              bank_transaction_id: bankTransactionId,
              categorization_task_id: persistOutcome.taskId,
              enriched_transaction: enrichedTransaction,
              run_id: runId,
            };
          }

          await logTaskEventSafe({
            categorization_task_id: persistOutcome.taskId,
            run_id: runId,
            event_stage: 'enrichment',
            event_type: 'categorization_task_created',
            event_timestamp: new Date(),
            metadata: {
              bank_transaction_id: bankTransactionId,
              company_id: companyId,
              enrichment_version: enrichedTransaction.version,
              checksum: result.checksum,
            },
          });

          results.successes.push({
            ...result,
            latencyMs: Date.now() - transactionStartTime,
          });

          logger.debug(
            {
              jobId: job.id,
              runId,
              bankTransactionId,
              latencyMs: Date.now() - transactionStartTime,
              skippedPersist: !persistOutcome.didPersist,
            },
            'Transaction enrichment committed',
          );
        });
        if (eventData) {
          await emitTxnEnrichedEvent(eventData);
        }
      } catch (error) {
        logger.error(
          {
            jobId: job.id,
            bankTransactionId,
            error,
          },
          'Error processing transaction - continuing with batch',
        );

        results.failures.push({
          success: false,
          bankTransactionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          latencyMs: Date.now() - startTime,
          checksum: '',
        });
      }
    }

    // Job complete
    const totalTime = Date.now() - startTime;
    const avgLatency =
      results.successes.length > 0
        ? results.successes.reduce((sum, r) => sum + r.latencyMs, 0) /
          results.successes.length
        : 0;

    logger.info(
      {
        jobId: job.id,
        companyId,
        totalTransactions,
        successes: results.successes.length,
        failures: results.failures.length,
        totalTimeMs: totalTime,
        avgLatencyMs: Math.round(avgLatency),
      },
      'Enrichment job completed',
    );

    // If all transactions failed, throw error to trigger job retry
    if (results.failures.length === totalTransactions) {
      throw new Error(
        `All ${totalTransactions} transactions failed enrichment`,
      );
    }

    return {
      successes: results.successes.length,
      failures: results.failures.length,
      totalTimeMs: totalTime,
    };
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        error,
        companyId: job.data.companyId,
        transactionCount: job.data.bankTransactionIds.length,
      },
      'Enrichment job failed',
    );
    throw error;
  }
}

/**
 * Persist enriched transaction to database
 * Upserts to categorization_tasks table
 */
const persistEnrichedTransaction = upsertCategorizationTask;
//   const payload = {
//     ...enrichedTransaction,
//   };

//   payload.ids.enrichment_job_id = jobId || null;

//   try {
//     const existing = await trx('categorization_tasks')
//       .where('bank_transaction_id', bankTransactionId)
//       .where('is_deleted', false)
//       .forUpdate()
//       .first();

//     if (existing) {
//       if (existing.checksum === options.checksum) {
//         logger.debug(
//           { bankTransactionId, categorizationTaskId: existing.id },
//           'Categorization task unchanged, skipping persist',
//         );
//         return { didPersist: false, checksum: existing.checksum };
//       }

//       await trx('categorization_tasks')
//         .where('id', existing.id)
//         .update({
//           enriched_transaction: JSON.stringify(payload),
//           enrichment_version: payload.version,
//           status: 'enriched',
//           checksum: options.checksum,
//           updated_at: trx.fn.now(),
//         });

//       logger.debug(
//         {
//           bankTransactionId,
//           categorizationTaskId: existing.id,
//           statsSnapshotChecksum: options.statsSnapshotChecksum,
//         },
//         'Updated existing categorization task with new snapshot',
//       );

//       return { didPersist: true, checksum: options.checksum };
//     }

//     await trx('categorization_tasks').insert({
//       bank_transaction_id: bankTransactionId,
//       company_id: companyId,
//       enriched_transaction: JSON.stringify(payload),
//       enrichment_version: payload.version,
//       status: 'enriched',
//       source: source as any,
//       checksum: options.checksum,
//     });

//     logger.debug(
//       {
//         bankTransactionId,
//         statsSnapshotChecksum: options.statsSnapshotChecksum,
//       },
//       'Inserted new categorization task',
//     );

//     return { didPersist: true, checksum: options.checksum };
//   } catch (error) {
//     logger.error(
//       { error, bankTransactionId },
//       'Failed to persist enriched transaction',
//     );
//     throw error;
//   }
// }

/**
 * Start enrichment worker
 * Returns worker instance for graceful shutdown
 */
export function startEnrichmentWorker(): Worker<EnrichmentJobData> {
  const worker = new Worker<EnrichmentJobData>(
    ENRICHMENT_QUEUE_NAME,
    processEnrichmentJob,
    ENRICHMENT_WORKER_OPTIONS,
  );

  worker.on('completed', (job, returnvalue) => {
    logger.info(
      {
        jobId: job.id,
        companyId: job.data.companyId,
        result: returnvalue,
      },
      'Enrichment job completed successfully',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        companyId: job?.data?.companyId,
        error: err.message,
        stack: err.stack,
      },
      'Enrichment job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Enrichment worker error');
  });

  logger.info('Enrichment worker started');

  return worker;
}
