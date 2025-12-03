import type { Knex } from 'knex';
import { logger } from '../../../shared/index.js';
import { type PredictionLineDraft } from '../post-prediction/predictions/predictions.service.js';
import {
  CandidateRepository,
  type CandidateLineDraft,
} from '../candidates/candidates.repository.js';
import { ConstraintViolationRepository } from '../candidates/constraint-violations.repository.js';
import type { PredictionSource } from '../post-prediction/predictions/predictions.types.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';
import { persistPrediction } from './prediction-persistence.service.js';
import {
  validateConstraints,
  type ConstraintViolation,
} from './constraint-validation.service.js';
import {
  resolveCandidateCreation,
  cleanupStaleCandidates,
  createCandidate,
  type ResolveCandidateCreationParams,
  type CandidateCreationParams,
} from './candidate-resolution.service.js';

export interface ProcessPredictionToCandidateParams {
  // Task context
  categorizationTaskId: string;
  bankTransactionId: string;
  bankTransactionDate: string;
  companyId: string;

  // Prediction data
  source: PredictionSource;
  runId: string;
  lines: CandidateLineDraft[];
  confidence: number;

  // Metadata
  modelVersion?: string | null;
  predictionId?: string; // Optional: use provided ID (e.g., from ML engine) instead of generating one
  explanation?: string | null;
  metadata?: Record<string, unknown> | null;

  // Enriched transaction context (for candidate creation)
  enrichedTransaction: EnrichedTransaction;

  // Dependencies (for testing)
  candidateRepository?: CandidateRepository;
  constraintViolationRepository?: ConstraintViolationRepository;
  knex: Knex;
  softDeleteExistingPredictions?: boolean;
}

export interface ProcessPredictionToCandidateResult {
  predictionId: string;
  candidateId?: string; // Only if candidate was created
  violations: ConstraintViolation[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * Process a prediction through the entire pipeline:
 * Prediction → Constraint Validation → Candidate Resolution & Persistence
 *
 * This is the main orchestrator function that handles the complete flow.
 * It should be called within a transaction that already has an advisory lock.
 *
 * @param params - Pipeline parameters
 * @returns Result with prediction ID, candidate ID (if created), violations, and skip info
 */
export async function processPredictionToCandidate(
  params: ProcessPredictionToCandidateParams,
): Promise<ProcessPredictionToCandidateResult> {
  const {
    categorizationTaskId,
    bankTransactionId,
    bankTransactionDate,
    companyId,
    source,
    runId,
    lines,
    confidence,
    modelVersion,
    predictionId: providedPredictionId,
    explanation,
    metadata,
    enrichedTransaction,
    candidateRepository: providedCandidateRepository,
    knex,
    softDeleteExistingPredictions,
  } = params;

  const candidateRepository =
    providedCandidateRepository ?? new CandidateRepository(knex);
  const constraintViolationRepository =
    params.constraintViolationRepository ??
    new ConstraintViolationRepository(knex);

  try {
    logger.debug(
      {
        categorizationTaskId,
        bankTransactionId,
        source,
        linesCount: lines.length,
      },
      'Processing prediction through pipeline',
    );

    // Step 1: Convert and validate before persisting
    const predictionLines: PredictionLineDraft[] = lines.map((line) => ({
      entryType: line.entryType,
      coaId: line.coaId,
      projectId: line.projectId ?? null,
      amountNative: line.amountNative,
      currencyCode: line.currencyCode,
      description: line.description ?? null,
      isBankLeg: line.isBankLeg ?? false,
      explanation: line.explanation ?? null,
      metadata: line.metadata ?? null,
    }));

    const validationResult = await validateConstraints(
      bankTransactionId,
      predictionLines,
    );

    // Step 2: Persist prediction (mark rejected when invalid)
    const predictionId = await persistPrediction({
      categorizationTaskId,
      bankTransactionId,
      bankTransactionDate,
      runId,
      companyId,
      source,
      lines: predictionLines,
      confidence,
      modelVersion,
      predictionId: providedPredictionId,
      explanation,
      metadata,
      knex,
      softDeleteExisting: softDeleteExistingPredictions,
      status: validationResult.isValid ? 'pending' : 'rejected',
    });

    logger.debug(
      {
        categorizationTaskId,
        predictionId,
      },
      'Prediction persisted',
    );

    logger.debug(
      {
        categorizationTaskId,
        predictionId,
        isValid: validationResult.isValid,
        violationsCount: validationResult.violations.length,
      },
      'Constraints validated',
    );

    // If constraints failed, return early without touching candidates
    if (!validationResult.isValid) {
      return {
        predictionId,
        candidateId: undefined,
        violations: validationResult.violations,
        skipped: true,
        skipReason: 'constraint_error',
      };
    }

    // Step 3: Resolve candidate creation
    const resolutionParams: ResolveCandidateCreationParams = {
      categorizationTaskId,
      source,
      candidateRepository,
    };

    const resolutionResult = await resolveCandidateCreation(resolutionParams);

    logger.debug(
      {
        categorizationTaskId,
        predictionId,
        shouldCreate: resolutionResult.shouldCreate,
        reason: resolutionResult.reason,
        staleCandidatesCount: resolutionResult.staleCandidateIds.length,
      },
      'Candidate resolution completed',
    );

    // Step 4: Clean up stale candidates
    if (resolutionResult.staleCandidateIds.length > 0) {
      await cleanupStaleCandidates(
        resolutionResult.staleCandidateIds,
        candidateRepository,
      );

      logger.debug(
        {
          categorizationTaskId,
          staleCandidatesCount: resolutionResult.staleCandidateIds.length,
        },
        'Stale candidates cleaned up',
      );
    }

    // Step 5: Create candidate if resolution allows
    let candidateId: string | undefined;
    if (resolutionResult.shouldCreate) {
      const candidateParams: CandidateCreationParams = {
        predictionId,
        categorizationTaskId,
        bankTransactionId,
        bankTransactionDate,
        companyId,
        source,
        lines,
        confidence,
        enrichedTransaction,
        explanation,
        metadata,
        candidateRepository,
      };

      candidateId = await createCandidate(candidateParams);

      // Persist any non-blocking violations against the new candidate
      if (validationResult.violations.length > 0) {
        if (candidateId) {
          const candidateIdSafe = candidateId as string;
          const drafts = validationResult.violations.map((violation) => ({
            candidateId: candidateIdSafe,
            violationType: violation.type,
            severity: violation.severity,
            message: violation.message,
            metadata: violation.metadata ?? null,
          }));
          await constraintViolationRepository.createMany(drafts);
        }
      }

      logger.debug(
        {
          categorizationTaskId,
          predictionId,
          candidateId,
        },
        'Candidate created',
      );
    }

    return {
      predictionId,
      candidateId,
      violations: validationResult.violations,
      skipped: !resolutionResult.shouldCreate,
      skipReason: resolutionResult.reason,
    };
  } catch (error) {
    logger.error(
      {
        categorizationTaskId,
        bankTransactionId,
        source,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Pipeline processing failed',
    );
    throw error;
  }
}
