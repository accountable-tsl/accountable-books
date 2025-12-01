import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import { PredictionRepository } from '../predictions/predictions.repository.js';
import {
  CandidateRepository,
  type CandidateLineDraft,
} from '../candidates/candidates.repository.js';
import { ConstraintViolationRepository } from '../candidates/constraint-violations.repository.js';
import { getMLEngineClient } from './ml-engine.client.js';
import type {
  MLPredictionJobData,
  EnrichedTransaction,
  MLPredictionOutput,
} from './ml-prediction.types.js';
import { processPredictionToCandidate } from '../processing/prediction-pipeline.service.js';
import type { MLPredictionMetadata } from '../predictions/predictions.types.js';
import { ensureCoaSnapshotCachedForML } from '../../chart-of-accounts/coa.model.js';

const CATEGORIZATION_TASKS_TABLE = 'categorization_tasks';
const PREDICTIONS_TABLE = 'categorization_predictions';

export interface MLPredictionDependencies {
  knex?: Knex;
  predictionRepository?: PredictionRepository;
  candidateRepository?: CandidateRepository;
  constraintViolationRepository?: ConstraintViolationRepository;
}

/**
 * Process ML prediction for an enriched transaction
 *
 * Main orchestration function that:
 * 1. Calls ML Engine API with enriched transaction
 * 2. Determines appropriate rank based on existing rule predictions
 * 3. Persists predictions to database
 * 4. Creates candidates for each prediction
 * 5. Updates categorization task metadata
 *
 * @param jobData - Job data from queue containing enriched transaction
 * @param deps - Optional dependencies for testing
 */
export async function processMLPrediction(
  jobData: MLPredictionJobData,
  deps: MLPredictionDependencies = {},
): Promise<void> {
  const db = deps.knex ?? knexClient;
  const {
    categorizationTaskId,
    bankTransactionId,
    companyId,
    enrichedTransaction,
  } = jobData;

  try {
    logger.info(
      {
        categorizationTaskId,
        bankTransactionId,
        companyId,
      },
      'Processing ML prediction',
    );

    await ensureCoaSnapshotCachedForML({
      companyUUID: enrichedTransaction.context.company_uuid,
      snapshotVersion: enrichedTransaction.context.coa_snapshot_version,
    });

    // Get ML Engine client
    const mlClient = getMLEngineClient();

    // Build ML Engine API request
    const mlRequest: EnrichedTransaction = enrichedTransaction;

    // Call ML Engine API
    const mlResponse = await mlClient.predict(mlRequest);

    // Extract transaction details for journal line assembly
    const transactionAmount = Math.abs(enrichedTransaction.raw.amount);
    if (transactionAmount === 0) {
      logger.warn(
        {
          categorizationTaskId,
          bankTransactionId,
        },
        'Transaction amount is zero, skipping ML prediction',
      );
      return;
    }

    const direction = enrichedTransaction.raw.amount > 0 ? 'inflow' : 'outflow';
    const currencyCode = enrichedTransaction.raw.currency_code;
    const bankCoaId = enrichedTransaction.ids.bank_account_coa_id;

    if (!bankCoaId) {
      logger.warn(
        {
          categorizationTaskId,
          bankTransactionId,
        },
        'Bank COA ID is missing, cannot assemble journal lines',
      );
      return;
    }

    // Assemble journal lines from ML prediction output
    const journalLines = assembleJournalLinesFromMLOutput({
      mlOutput: mlResponse,
      transactionAmount,
      direction,
      currencyCode,
      bankCoaId,
    });

    if (journalLines.length === 0) {
      logger.warn(
        {
          categorizationTaskId,
          bankTransactionId,
        },
        'No journal lines assembled from ML output',
      );
      return;
    }

    // Extract model outputs for metadata
    const confidence = mlResponse.tenant_account_ranker.selected_account_score;
    const explanation =
      mlResponse.tenant_account_ranker.explanation.message ?? null;
    const modelVersion = String(
      mlResponse.global_intent_classifier.model_version ??
        mlResponse.tenant_account_ranker.model_version,
    );

    // Generate prediction group ID for this ML run (ties all predictions together)
    const predictionGroupId = crypto.randomUUID();
    const predictionId = crypto.randomUUID();

    // Persist ML predictions and candidates in transaction
    await db.transaction(async (trx) => {
      const predictionRepo =
        deps.predictionRepository ?? new PredictionRepository(trx);
      const candidateRepo =
        deps.candidateRepository ?? new CandidateRepository(trx);
      const violationRepo =
        deps.constraintViolationRepository ??
        new ConstraintViolationRepository(trx);

      // Serialize candidate/prediction writes per task
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
        categorizationTaskId,
      ]);

      // Determine starting rank and isPrimary based on existing predictions
      const { baseRank, isPrimaryByDefault } = await determineMLPredictionRank(
        categorizationTaskId,
        trx,
      );

      // Build typed metadata for ML prediction
      const metadata: MLPredictionMetadata = {
        provenance: 'ml_engine',
        model_version: modelVersion,
        global_intent_classifier: mlResponse.global_intent_classifier,
        tenant_account_ranker: mlResponse.tenant_account_ranker,
      };

      const pipelineResult = await processPredictionToCandidate({
        categorizationTaskId,
        bankTransactionId,
        bankTransactionDate: enrichedTransaction.raw.date,
        companyId,
        source: 'ml',
        lines: journalLines,
        confidence,
        rank: baseRank,
        isPrimary: isPrimaryByDefault,
        modelVersion,
        predictionGroupId,
        predictionId,
        explanation,
        metadata,
        enrichedTransaction,
        predictionRepository: predictionRepo,
        candidateRepository: candidateRepo,
        constraintViolationRepository: violationRepo,
        knex: trx,
        softDeleteExistingPredictions: false,
      });

      // Update task metadata
      await updateTaskMetadata(
        {
          taskId: categorizationTaskId,
          status: 'completed',
          modelVersion,
          predictionsCount: 1,
        },
        trx,
      );
    });

    logger.info(
      {
        categorizationTaskId,
        bankTransactionId,
        accountId: mlResponse.final_posting.account_id,
        modelVersion,
        predictionGroupId,
      },
      'ML prediction completed successfully',
    );
  } catch (error) {
    logger.error(
      {
        categorizationTaskId,
        bankTransactionId,
        companyId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'ML prediction processing failed',
    );

    // Update task with error status
    await updateTaskMetadata(
      {
        taskId: categorizationTaskId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      db,
    );

    throw error;
  }
}

/**
 * Determine the appropriate rank and isPrimary for ML predictions
 * based on existing rule predictions
 *
 * Logic:
 * - If no predictions exist: ML gets rank=1, isPrimary=true
 * - If rule predictions exist: ML gets rank=2+, isPrimary=false (rules win)
 * - Future: Compare confidences dynamically
 *
 * @param categorizationTaskId - Task ID to check
 * @param trx - Database transaction
 * @returns Base rank and isPrimary flag for ML predictions
 */
async function determineMLPredictionRank(
  categorizationTaskId: string,
  trx: Knex,
): Promise<{ baseRank: number; isPrimaryByDefault: boolean }> {
  const existingPredictions = await trx(PREDICTIONS_TABLE)
    .where({
      categorization_task_id: categorizationTaskId,
      is_deleted: false,
    })
    .orderBy('rank', 'asc')
    .select('source', 'rank', 'confidence');

  if (existingPredictions.length === 0) {
    // No predictions yet - ML is primary
    return { baseRank: 1, isPrimaryByDefault: true };
  }

  // Rule predictions exist - ML is secondary
  // Rules have confidence=1.0 (deterministic), so they win
  const maxRank = Math.max(...existingPredictions.map((p) => p.rank));
  return { baseRank: maxRank + 1, isPrimaryByDefault: false };
}

/**
 * Assemble journal lines from ML prediction output
 *
 * Creates a balanced journal entry with:
 * - Bank leg (debit for inflow, credit for outflow)
 * - Counterpart leg using the predicted account (credit for inflow, debit for outflow)
 */
function assembleJournalLinesFromMLOutput(params: {
  mlOutput: MLPredictionOutput;
  transactionAmount: number;
  direction: 'inflow' | 'outflow';
  currencyCode: string;
  bankCoaId: string;
}): CandidateLineDraft[] {
  const { mlOutput, transactionAmount, direction, currencyCode, bankCoaId } =
    params;

  const counterpartAccountId = mlOutput.final_posting.account_id;

  // Determine entry types based on transaction direction
  const bankEntryType = direction === 'inflow' ? 'debit' : 'credit';
  const counterpartEntryType = direction === 'inflow' ? 'credit' : 'debit';

  const lines: CandidateLineDraft[] = [];

  // Bank leg
  lines.push({
    entryType: bankEntryType,
    coaId: bankCoaId,
    amountNative: toCurrency(transactionAmount),
    currencyCode,
    description: 'Bank leg',
    isBankLeg: true,
    splitType: 'bank',
    metadata: { direction },
  });

  // Counterpart leg using predicted account
  lines.push({
    entryType: counterpartEntryType,
    coaId: counterpartAccountId,
    amountNative: toCurrency(transactionAmount),
    currencyCode,
    description: mlOutput.final_posting.account_label ?? null,
    isBankLeg: false,
    splitType: 'bank',
    metadata: {
      account_label: mlOutput.final_posting.account_label,
      global_intent: mlOutput.global_intent_classifier.semantic_top1,
      intent_confidence: mlOutput.global_intent_classifier.semantic_top1_prob,
      ranker_score: mlOutput.tenant_account_ranker.selected_account_score,
      ranker_reason: mlOutput.tenant_account_ranker.explanation.reason,
    },
  });

  return lines;
}

/**
 * Round amount to 2 decimal places (currency precision)
 */
function toCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Update categorization task metadata with ML prediction status
 */
async function updateTaskMetadata(
  params: {
    taskId: string;
    status: 'completed' | 'attempted' | 'error';
    modelVersion?: string;
    predictionsCount?: number;
    latencyMs?: number;
    error?: string;
  },
  knex: Knex,
): Promise<void> {
  const { taskId, status, modelVersion, predictionsCount, latencyMs, error } =
    params;

  const metadataPatch = {
    status,
    model_version: modelVersion ?? null,
    predictions_count: predictionsCount ?? 0,
    latency_ms: latencyMs ?? null,
    error_message: error ?? null,
    updated_at: new Date().toISOString(),
  };

  await knex(CATEGORIZATION_TASKS_TABLE)
    .where({ id: taskId })
    .update({
      metadata: knex.raw(
        `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ml_engine}', ?::jsonb, true)`,
        JSON.stringify(metadataPatch),
      ),
      updated_at: knex.fn.now(),
    });
}
