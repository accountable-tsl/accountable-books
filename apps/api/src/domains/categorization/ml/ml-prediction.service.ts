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
  MLPredictionRequest,
  MLPrediction,
} from './ml-prediction.types.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';
import { processPredictionToCandidate } from '../processing/prediction-pipeline.service.js';

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

    // Get ML Engine client
    const mlClient = getMLEngineClient();

    // Build ML Engine API request
    const mlRequest: MLPredictionRequest = {
      enrichedTransaction: enrichedTransaction,
      companyContext: {
        companyId: enrichedTransaction.ids.company_uuid,
        coaSnapshotId: enrichedTransaction.context.coa_snapshot_id,
        coaSnapshotVersion: enrichedTransaction.context.coa_snapshot_version,
      },
    };

    // Call ML Engine API
    const mlResponse = await mlClient.predict(mlRequest);

    // Handle ML Engine errors gracefully
    if (!mlResponse.success || !mlResponse.predictions.length) {
      logger.warn(
        {
          categorizationTaskId,
          bankTransactionId,
          error: mlResponse.error,
        },
        'ML Engine returned no predictions or failed',
      );

      // Update task metadata to reflect ML attempted but failed
      await updateTaskMetadata(
        {
          taskId: categorizationTaskId,
          status: 'attempted',
          error: mlResponse.error,
          modelVersion: mlResponse.modelVersion,
          latencyMs: mlResponse.latencyMs,
        },
        db,
      );
      return;
    }

    // Generate prediction group ID for this ML run (ties all predictions together)
    const predictionGroupId = crypto.randomUUID();

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

      // Persist each ML prediction and create corresponding candidate
      let mlCandidateCreated = false;
      for (let i = 0; i < mlResponse.predictions.length; i++) {
        const mlPrediction = mlResponse.predictions[i];
        const actualRank = baseRank + i; // Offset by baseRank
        const isPrimary = isPrimaryByDefault && i === 0; // First ML prediction is primary if no rules exist

        const pipelineResult = await processPredictionToCandidate({
          categorizationTaskId,
          bankTransactionId,
          bankTransactionDate: enrichedTransaction.raw.date,
          companyId,
          source: 'ml',
          lines: toCandidateLines(mlPrediction.lines),
          confidence: mlPrediction.confidence,
          rank: actualRank,
          isPrimary,
          modelVersion: mlResponse.modelVersion,
          predictionGroupId,
          explanation: mlPrediction.explanation ?? null,
          metadata: mlPrediction.metadata ?? null,
          enrichedTransaction,
          predictionRepository: predictionRepo,
          candidateRepository: candidateRepo,
          constraintViolationRepository: violationRepo,
          knex: trx,
          softDeleteExistingPredictions: false,
        });

        if (pipelineResult.candidateId) {
          mlCandidateCreated = true;
        }
      }

      // Update task metadata
      await updateTaskMetadata(
        {
          taskId: categorizationTaskId,
          status: 'completed',
          modelVersion: mlResponse.modelVersion,
          predictionsCount: mlResponse.predictions.length,
          latencyMs: mlResponse.latencyMs,
        },
        trx,
      );
    });

    logger.info(
      {
        categorizationTaskId,
        bankTransactionId,
        predictionsCount: mlResponse.predictions.length,
        modelVersion: mlResponse.modelVersion,
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

function toCandidateLines(lines: MLPrediction['lines']): CandidateLineDraft[] {
  return lines.map((line) => ({
    entryType: line.entryType,
    coaId: line.coaId,
    projectId: line.projectId ?? null,
    amountNative: line.amountNative,
    currencyCode: line.currencyCode,
    description: line.description ?? null,
    isBankLeg: line.isBankLeg ?? false,
    splitType: line.splitType,
    splitValue: line.splitValue ?? null,
    metadata: line.metadata ?? null,
  }));
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
