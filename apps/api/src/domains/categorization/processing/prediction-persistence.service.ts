import type { Knex } from 'knex';
import {
  PredictionRepository,
  type PredictionLineDraft,
} from '../predictions/predictions.repository.js';
import type { PredictionSource } from '../predictions/predictions.types.js';

const PREDICTIONS_TABLE = 'categorization_predictions';

export interface PersistPredictionParams {
  categorizationTaskId: string;
  bankTransactionId: string;
  bankTransactionDate: string;
  companyId: string;
  source: PredictionSource;
  lines: PredictionLineDraft[];
  confidence: number;
  rank?: number; // Optional, will be determined if not provided
  isPrimary?: boolean; // Optional, will be determined if not provided
  modelVersion?: string | null;
  predictionGroupId?: string | null;
  explanation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  predictionRepository?: PredictionRepository;
  knex: Knex;
  softDeleteExisting?: boolean;
  status?: 'pending' | 'accepted' | 'rejected' | 'superseded';
}

export interface PredictionRankResult {
  rank: number;
  isPrimary: boolean;
}

/**
 * Determine the appropriate rank and isPrimary for a new prediction
 * based on existing predictions for the task
 *
 * Logic:
 * - If no predictions exist: rank=1, isPrimary=true
 * - If rule predictions exist and source is 'ml': ML gets rank=2+, isPrimary=false (rules win)
 * - If ML predictions exist and source is 'rule': Rule gets rank=1, isPrimary=true (rules win)
 * - If same source predictions exist: rank=max+1, isPrimary=false
 *
 * @param categorizationTaskId - Task ID to check
 * @param source - Source of the new prediction
 * @param trx - Database transaction
 * @returns Rank and isPrimary flag for the new prediction
 */
export async function determinePredictionRank(
  categorizationTaskId: string,
  source: PredictionSource,
  trx: Knex,
): Promise<PredictionRankResult> {
  const existingPredictions = await trx(PREDICTIONS_TABLE)
    .where({
      categorization_task_id: categorizationTaskId,
      is_deleted: false,
    })
    .orderBy('rank', 'asc')
    .select('source', 'rank', 'confidence');

  if (existingPredictions.length === 0) {
    // No predictions yet - this is the first one
    return { rank: 1, isPrimary: true };
  }

  // Check if there are rule predictions
  const hasRulePredictions = existingPredictions.some(
    (p) => p.source === 'rule',
  );

  if (source === 'rule') {
    // Rules always get rank=1 and isPrimary=true (they win)
    // Soft-delete existing predictions will happen before this is called
    return { rank: 1, isPrimary: true };
  }

  // Source is 'ml'
  if (hasRulePredictions) {
    // Rule predictions exist - ML is secondary
    // Rules have confidence=1.0 (deterministic), so they win
    const maxRank = Math.max(...existingPredictions.map((p) => p.rank));
    return { rank: maxRank + 1, isPrimary: false };
  }

  // Only ML predictions exist - this ML prediction gets rank=max+1
  const maxRank = Math.max(...existingPredictions.map((p) => p.rank));
  // First ML prediction in a group might be primary, but we'll let caller decide
  return { rank: maxRank + 1, isPrimary: false };
}

/**
 * Persist a prediction with its lines to the database
 *
 * Handles:
 * - Soft-deleting existing predictions by source
 * - Determining rank and isPrimary if not provided
 * - Creating prediction with lines
 *
 * @param params - Prediction persistence parameters
 * @returns Prediction ID
 */
export async function persistPrediction(
  params: PersistPredictionParams,
): Promise<string> {
  const {
    categorizationTaskId,
    bankTransactionId,
    bankTransactionDate,
    companyId,
    source,
    lines,
    confidence,
    rank: providedRank,
    isPrimary: providedIsPrimary,
    modelVersion,
    predictionGroupId,
    explanation,
    metadata,
    predictionRepository: providedPredictionRepository,
    knex,
    softDeleteExisting = true,
  } = params;

  const predictionRepository =
    providedPredictionRepository ?? new PredictionRepository(knex);

  // Soft-delete existing predictions by source (unless caller opts out)
  if (softDeleteExisting) {
    await predictionRepository.softDeleteByTask({
      categorizationTaskId,
      source,
    });
  }

  // Determine rank and isPrimary if not provided
  let rank: number;
  let isPrimary: boolean;

  if (providedRank !== undefined && providedIsPrimary !== undefined) {
    rank = providedRank;
    isPrimary = providedIsPrimary;
  } else {
    const rankResult = await determinePredictionRank(
      categorizationTaskId,
      source,
      knex,
    );
    rank = providedRank ?? rankResult.rank;
    isPrimary = providedIsPrimary ?? rankResult.isPrimary;
  }

  // Ensure uniqueness of primary per task by demoting existing primaries
  if (isPrimary) {
    await knex(PREDICTIONS_TABLE)
      .where({
        categorization_task_id: categorizationTaskId,
        is_deleted: false,
      })
      .update({ is_primary: false, updated_at: knex.fn.now() });
  }

  // Create prediction with lines
  const predictionId = await predictionRepository.createPredictionWithLines({
    categorizationTaskId,
    bankTransactionId,
    bankTransactionDate,
    companyId,
    source,
    rank,
    isPrimary,
    confidence,
    modelVersion: modelVersion ?? null,
    predictionGroupId: predictionGroupId ?? null,
    status: params.status ?? 'pending',
    inputChecksum: null,
    explanation: explanation ?? null,
    metadata: metadata ?? null,
    lines,
  });

  return predictionId;
}
