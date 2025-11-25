import {
  CandidateRepository,
  type CandidateLineDraft,
} from '../candidates/candidates.repository.js';
import type { PredictionSource } from '../predictions/predictions.types.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';

export interface CandidateResolutionResult {
  shouldCreate: boolean;
  reason?: string;
  postedCandidateId?: string;
  staleCandidateIds: string[];
}

export interface ResolveCandidateCreationParams {
  categorizationTaskId: string;
  source: PredictionSource;
  candidateRepository: CandidateRepository;
}

export interface CandidateCreationParams {
  predictionId: string;
  categorizationTaskId: string;
  bankTransactionId: string;
  bankTransactionDate: string;
  companyId: string;
  source: PredictionSource;
  lines: CandidateLineDraft[];
  confidence: number;
  enrichedTransaction: EnrichedTransaction;
  solverNotes?: string;
  metadata?: Record<string, unknown> | null;
  candidateRepository: CandidateRepository;
}

/**
 * Resolve whether a candidate should be created based on existing state
 *
 * Logic:
 * 1. Check for posted candidate → if exists, don't create new candidate
 * 2. Check for rule candidate → if exists and source is 'ml', don't create ML candidate
 * 3. Soft-delete stale candidates (respecting posted status)
 * 4. Return decision with cleanup information
 *
 * @param params - Resolution parameters
 * @returns Resolution result with decision and cleanup info
 */
export async function resolveCandidateCreation(
  params: ResolveCandidateCreationParams,
): Promise<CandidateResolutionResult> {
  const { categorizationTaskId, source, candidateRepository } = params;

  // Find all active candidates for this task
  const existingCandidates = await candidateRepository.findActiveByTask({
    categorizationTaskId,
  });

  // Check for posted candidate
  const postedCandidate = existingCandidates.find(
    (candidate) => candidate.status === 'posted',
  );

  if (postedCandidate) {
    // Posted candidate exists - don't create new candidate
    // Clean up stale candidates (excluding posted one)
    const staleCandidateIds = existingCandidates
      .filter((candidate) => candidate.id !== postedCandidate.id)
      .map((candidate) => candidate.id);

    return {
      shouldCreate: false,
      reason: 'posted_candidate_exists',
      postedCandidateId: postedCandidate.id,
      staleCandidateIds,
    };
  }

  // Check for rule candidate
  const hasRuleCandidate = existingCandidates.some(
    (candidate) => candidate.source === 'rule',
  );

  if (hasRuleCandidate && source === 'ml') {
    // Rule candidate exists and this is ML - don't create ML candidate
    // Clean up stale ML candidates
    const staleMlCandidateIds = existingCandidates
      .filter((candidate) => candidate.source === 'ml')
      .map((candidate) => candidate.id);

    return {
      shouldCreate: false,
      reason: 'rule_candidate_exists',
      staleCandidateIds: staleMlCandidateIds,
    };
  }

  // Determine stale candidates to clean up
  // If source is 'rule', delete all existing candidates (rules win)
  // If source is 'ml' and no rule candidate exists, delete existing ML candidates
  const staleCandidateIds =
    source === 'rule'
      ? existingCandidates.map((candidate) => candidate.id)
      : existingCandidates
          .filter((candidate) => candidate.source === 'ml')
          .map((candidate) => candidate.id);

  return {
    shouldCreate: true,
    staleCandidateIds,
  };
}

/**
 * Clean up stale candidates by soft-deleting them
 *
 * @param candidateIds - Array of candidate IDs to soft-delete
 * @param candidateRepository - Candidate repository instance
 */
export async function cleanupStaleCandidates(
  candidateIds: string[],
  candidateRepository: CandidateRepository,
): Promise<void> {
  if (candidateIds.length > 0) {
    await candidateRepository.softDeleteByIds(candidateIds);
  }
}

/**
 * Create a candidate from a prediction
 *
 * Transforms prediction lines into a candidate ready for constraint validation
 * and user review.
 *
 * @param params - Candidate creation parameters
 * @returns Candidate ID
 */
export async function createCandidate(
  params: CandidateCreationParams,
): Promise<string> {
  const {
    predictionId,
    categorizationTaskId,
    bankTransactionId,
    bankTransactionDate,
    companyId,
    source,
    lines,
    confidence,
    enrichedTransaction,
    solverNotes,
    metadata,
    candidateRepository: providedCandidateRepository,
  } = params;

  // Determine solver notes based on source
  const defaultSolverNotes =
    source === 'rule' ? 'rule_engine_auto' : 'ml_engine_auto';

  // Build candidate metadata
  const candidateMetadata: Record<string, unknown> = {
    provenance: source === 'rule' ? 'rule_engine' : 'ml_engine',
    ...metadata,
  };

  if (source === 'ml' && metadata?.model_version) {
    candidateMetadata.model_version = metadata.model_version;
  }

  // Create candidate with lines
  const candidateId =
    await providedCandidateRepository.createCandidateWithLines({
      predictionId,
      source,
      categorizationTaskId,
      bankTransactionId,
      bankTransactionDate,
      companyId,
      status: 'proposed',
      confidence,
      contactId: enrichedTransaction.ids.contact_id ?? null,
      description: enrichedTransaction.raw.description ?? null,
      reference: enrichedTransaction.normalized.normalized_reference ?? null,
      solverNotes: solverNotes ?? defaultSolverNotes,
      metadata: candidateMetadata,
      lines,
    });

  return candidateId;
}
