import { mlPredictionOutput } from '@accountable-books/contracts/schema';
import z from 'zod';

import {
  CURRENT_ML_TYPE,
  getMLEngineClient,
} from '../../../integrations/index.js';
import { logger } from '../../../shared/index.js';
import { ensureCoaSnapshotCachedForML } from '../../chart-of-accounts/coa.model.js';
import { handlePostPrediction } from '../post-prediction/post-prediction.service.js';
import { logTaskEventSafe } from '../tasks/task-events.service.js';
import type {
  MLPredictionJobData,
  MLPredictionOutput,
} from './ml-prediction.types.js';

/**
 * Process ML prediction for an enriched transaction
 *
 * Main orchestration function that:
 * 1. Calls ML Engine API with enriched transaction
 * 2. Generates run ID for tracking this execution
 * 3. Persists predictions to database
 * 4. Creates candidates for each prediction
 * 5. Updates categorization task metadata
 *
 * @param jobData - Job data from queue containing enriched transaction
 * @param deps - Optional dependencies for testing
 */
export async function processMLPrediction(
  jobData: MLPredictionJobData,
): Promise<void> {
  const {
    categorizationTaskId,
    bankTransactionId,
    companyId,
    enrichedTransaction,
    runId,
  } = jobData;

  // Track network latency (API call overhead) for debugging
  // Note: ML processing latency comes from ML engine's component latencies (more accurate)
  const networkStartTime = Date.now();
  let failureLogged = false;

  let mlResult: MLPredictionOutput;
  try {
    logger.info(
      {
        categorizationTaskId,
        bankTransactionId,
        companyId,
        runId: jobData.runId,
      },
      'Processing ML prediction',
    );

    await ensureCoaSnapshotCachedForML({
      companyUUID: enrichedTransaction.context.company_uuid,
      snapshotVersion: enrichedTransaction.context.coa_snapshot_version,
    });

    // Get ML Engine client
    const mlClient = getMLEngineClient();

    // Call ML Engine API
    mlResult = await mlClient.predict(enrichedTransaction);

    // Validate ML output structure using Zod schema before logging success
    // This ensures we fail fast and log the task correctly if validation fails
    const validationResult = mlPredictionOutput.safeParse(mlResult);
    if (!validationResult.success) {
      const networkLatencyMs = Date.now() - networkStartTime;
      logger.error(
        {
          categorizationTaskId,
          bankTransactionId,
          companyId,
          validationErrors: validationResult.error.format(),
        },
        'ML prediction output failed schema validation',
      );

      await logTaskEventSafe({
        categorization_task_id: categorizationTaskId,
        run_id: runId,
        source: 'ml',
        event_type: 'ml_failed',
        event_timestamp: new Date(),
        metadata: {
          error: 'Schema validation failed',
          validation_errors: z.flattenError(validationResult.error),
          // Use network latency as fallback when we can't compute ML latency
          latency_ms: networkLatencyMs,
        },
      });
      failureLogged = true;

      throw new Error(
        `ML prediction output validation failed: ${validationResult.error.message}`,
      );
    }

    // Calculate ML processing latency from component latencies
    // This is more accurate than measuring with Date.now() as it excludes network overhead
    // and represents actual ML engine processing time
    const totalMLLatencyMs =
      mlResult.global_intent_classifier.latency_ms +
      mlResult.tenant_account_ranker.latency_ms +
      (mlResult.accrual_resolver?.latency_ms ?? 0);

    const networkLatencyMs = Date.now() - networkStartTime;

    // Validation passed - log success
    await logTaskEventSafe({
      categorization_task_id: categorizationTaskId,
      run_id: runId,
      source: 'ml',
      event_type: 'ml_completed',
      event_timestamp: new Date(),
      metadata: {
        model_version: mlResult.global_intent_classifier.model_version,
        account_id: mlResult.final_posting.account_id,
        latency_ms: totalMLLatencyMs, // ML processing latency (sum of components)
        component_latencies: {
          global_intent_classifier:
            mlResult.global_intent_classifier.latency_ms,
          tenant_account_ranker: mlResult.tenant_account_ranker.latency_ms,
          ...(mlResult.accrual_resolver
            ? { accrual_resolver: mlResult.accrual_resolver.latency_ms }
            : {}),
        },
        // Include network latency for debugging (separate from ML processing time)
        network_latency_ms: networkLatencyMs,
      },
    });

    // Wrap handlePostPrediction in try/catch to catch errors after ml_completed
    // This ensures we log ml_post_processing_failed if post-processing fails
    try {
      await handlePostPrediction({
        source: CURRENT_ML_TYPE, // ML is heuristics based for now
        event: {
          categorization_task_id: categorizationTaskId,
          enriched_transaction: enrichedTransaction,
          bank_transaction_id: bankTransactionId,
          company_uuid: companyId,
          run_id: runId,
        },
        mlResult,
        runId,
        mlLatencyMs: totalMLLatencyMs, // Pass ML processing latency for potential use in events
      });
    } catch (error) {
      // Log post-processing failure as ml_failed
      // Note: ml_completed was already logged, but we log ml_failed to indicate the overall process failed
      await logTaskEventSafe({
        categorization_task_id: categorizationTaskId,
        run_id: runId,
        source: 'ml',
        event_type: 'ml_failed',
        event_timestamp: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          error_phase: 'post_processing',
          ml_latency_ms: totalMLLatencyMs,
        },
      });
      failureLogged = true;

      logger.error(
        {
          categorizationTaskId,
          bankTransactionId,
          companyId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'ML post-processing failed after ml_completed',
      );

      throw error;
    }
  } catch (error) {
    const networkLatencyMs = Date.now() - networkStartTime;

    logger.error(
      {
        categorizationTaskId,
        bankTransactionId,
        companyId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'ML prediction processing failed',
    );

    // Only log ml_failed if we haven't already logged it (e.g., validation error, post-processing error)
    // Check if error is from validation or post-processing (those already logged)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (!failureLogged) {
      // For errors before we get ML result, use network latency as fallback
      await logTaskEventSafe({
        categorization_task_id: categorizationTaskId,
        run_id: runId,
        source: 'ml',
        event_type: 'ml_failed',
        event_timestamp: new Date(),
        metadata: {
          error: errorMessage,
          latency_ms: networkLatencyMs, // Network latency as fallback
        },
      });
    }

    throw error;
  }
  //   // Extract transaction details for journal line assembly
  //   const transactionAmount = Math.abs(enrichedTransaction.raw.amount);
  //   if (transactionAmount === 0) {
  //     logger.warn(
  //       {
  //         categorizationTaskId,
  //         bankTransactionId,
  //       },
  //       'Transaction amount is zero, skipping ML prediction',
  //     );
  //     return;
  //   }

  //   const direction = enrichedTransaction.raw.amount > 0 ? 'inflow' : 'outflow';
  //   const currencyCode = enrichedTransaction.raw.currency_code;
  //   const bankCoaId = enrichedTransaction.ids.bank_account_coa_id;

  //   if (!bankCoaId) {
  //     logger.warn(
  //       {
  //         categorizationTaskId,
  //         bankTransactionId,
  //       },
  //       'Bank COA ID is missing, cannot assemble journal lines',
  //     );
  //     return;
  //   }

  //   // Assemble journal lines from ML prediction output
  //   const journalLines = assembleJournalLinesFromMLOutput({
  //     mlOutput: mlResponse,
  //     transactionAmount,
  //     direction,
  //     currencyCode,
  //     bankCoaId,
  //   });

  //   if (journalLines.length === 0) {
  //     logger.warn(
  //       {
  //         categorizationTaskId,
  //         bankTransactionId,
  //       },
  //       'No journal lines assembled from ML output',
  //     );
  //     return;
  //   }

  //   // Extract model outputs for metadata
  //   const confidence = mlResponse.tenant_account_ranker.selected_account_score;
  //   const explanation =
  //     mlResponse.tenant_account_ranker.explanation.message ?? null;
  //   const modelVersion = String(
  //     mlResponse.global_intent_classifier.model_version ??
  //       mlResponse.tenant_account_ranker.model_version,
  //   );

  //   // Generate run ID for this ML execution
  //   const runId = randomUUID();
  //   const predictionId = randomUUID();

  //   // Persist ML predictions and candidates in transaction
  //   await db.transaction(async (trx) => {
  //     const candidateRepo =
  //       deps.candidateRepository ?? new CandidateRepository(trx);
  //     const violationRepo =
  //       deps.constraintViolationRepository ??
  //       new ConstraintViolationRepository(trx);

  //     // Serialize candidate/prediction writes per task
  //     await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
  //       categorizationTaskId,
  //     ]);

  //     // Build typed metadata for ML prediction
  //     const metadata: MLPredictionMetadata = {
  //       provenance: 'ml_engine',
  //       global_intent_classifier: mlResponse.global_intent_classifier,
  //       tenant_account_ranker: mlResponse.tenant_account_ranker,
  //       final_posting: mlResponse.final_posting,
  //       explanation: mlResponse.tenant_account_ranker.explanation,
  //       accrual_resolver: mlResponse.accrual_resolver ?? undefined,
  //     };

  //     const pipelineResult = await processPredictionToCandidate({
  //       categorizationTaskId,
  //       bankTransactionId,
  //       bankTransactionDate: enrichedTransaction.raw.date,
  //       companyId,
  //       source: 'ml',
  //       runId,
  //       lines: journalLines,
  //       confidence,
  //       modelVersion,
  //       predictionId,
  //       explanation,
  //       metadata,
  //       enrichedTransaction,
  //       candidateRepository: candidateRepo,
  //       constraintViolationRepository: violationRepo,
  //       knex: trx,
  //       softDeleteExistingPredictions: false,
  //     });

  //     // Update task metadata
  //     await updateTaskMetadata(
  //       {
  //         taskId: categorizationTaskId,
  //         status: 'completed',
  //         modelVersion,
  //         predictionsCount: 1,
  //       },
  //       trx,
  //     );
  //   });

  //   logger.info(
  //     {
  //       categorizationTaskId,
  //       bankTransactionId,
  //       accountId: mlResponse.final_posting.account_id,
  //       modelVersion,
  //       runId,
  //     },
  //     'ML prediction completed successfully',
  //   );
}

// /**
//  * Assemble journal lines from ML prediction output
//  *
//  * Creates a balanced journal entry with:
//  * - Bank leg (debit for inflow, credit for outflow)
//  * - Counterpart leg using the predicted account (credit for inflow, debit for outflow)
//  */
// function assembleJournalLinesFromMLOutput(params: {
//   mlOutput: MLPredictionOutput;
//   transactionAmount: number;
//   direction: 'inflow' | 'outflow';
//   currencyCode: string;
//   bankCoaId: string;
// }): CandidateLineDraft[] {
//   const { mlOutput, transactionAmount, direction, currencyCode, bankCoaId } =
//     params;

//   const counterpartAccountId = mlOutput.final_posting.account_id;

//   // Determine entry types based on transaction direction
//   const bankEntryType = direction === 'inflow' ? 'debit' : 'credit';
//   const counterpartEntryType = direction === 'inflow' ? 'credit' : 'debit';

//   const lines: CandidateLineDraft[] = [];

//   // Bank leg
//   lines.push({
//     entryType: bankEntryType,
//     coaId: bankCoaId,
//     amountNative: toCurrency(transactionAmount),
//     currencyCode,
//     description: 'Bank leg',
//     isBankLeg: true,
//     splitType: 'bank',
//     metadata: { direction },
//   });

//   // Counterpart leg using predicted account
//   lines.push({
//     entryType: counterpartEntryType,
//     coaId: counterpartAccountId,
//     amountNative: toCurrency(transactionAmount),
//     currencyCode,
//     description: mlOutput.final_posting.account_label ?? null,
//     isBankLeg: false,
//     splitType: 'bank',
//     metadata: {
//       account_label: mlOutput.final_posting.account_label,
//       global_intent: mlOutput.global_intent_classifier.semantic_top1,
//       intent_confidence: mlOutput.global_intent_classifier.semantic_top1_prob,
//       ranker_score: mlOutput.tenant_account_ranker.selected_account_score,
//       ranker_reason: mlOutput.tenant_account_ranker.explanation.reason,
//     },
//   });

//   return lines;
// }

// /**
//  * Round amount to 2 decimal places (currency precision)
//  */
// function toCurrency(value: number): number {
//   return Math.round(value * 100) / 100;
// }

// /**
//  * Update categorization task metadata with ML prediction status
//  */
// async function updateTaskMetadata(
//   params: {
//     taskId: string;
//     status: 'completed' | 'attempted' | 'error';
//     modelVersion?: string;
//     predictionsCount?: number;
//     latencyMs?: number;
//     error?: string;
//   },
//   knex: Knex,
// ): Promise<void> {
//   const { taskId, status, modelVersion, predictionsCount, latencyMs, error } =
//     params;

//   const metadataPatch = {
//     status,
//     model_version: modelVersion ?? null,
//     predictions_count: predictionsCount ?? 0,
//     latency_ms: latencyMs ?? null,
//     error_message: error ?? null,
//     updated_at: new Date().toISOString(),
//   };

//   await knex(CATEGORIZATION_TASKS_TABLE)
//     .where({ id: taskId })
//     .update({
//       metadata: knex.raw(
//         `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ml_engine}', ?::jsonb, true)`,
//         JSON.stringify(metadataPatch),
//       ),
//       updated_at: knex.fn.now(),
//     });
// }
