import { z } from 'zod';
import { enrichedTransactionSchema } from '../enrichment/enrichment.types.js';

// ============================================
// ML PREDICTION JOB DATA
// ============================================

export const mlPredictionJobDataSchema = z.object({
  categorizationTaskId: z.uuid(),
  bankTransactionId: z.uuid(),
  companyId: z.uuid(),
  enrichedTransaction: enrichedTransactionSchema,
});

export type MLPredictionJobData = z.infer<typeof mlPredictionJobDataSchema>;

// ============================================
// ML ENGINE API TYPES
// ============================================

/**
 * Request payload sent to ML Engine API
 */
export interface MLPredictionRequest {
  enrichedTransaction: unknown; // EnrichedTransaction serialized
  companyContext?: {
    companyId: string;
    coaSnapshotId: string;
    coaSnapshotVersion: string;
  };
}

/**
 * Individual journal line predicted by ML Engine
 */
export interface MLPredictedLine {
  entryType: 'debit' | 'credit';
  coaId: string;
  projectId?: string | null;
  amountNative: number;
  amountReporting?: number | null;
  currencyCode: string;
  description?: string | null;
  isBankLeg?: boolean;
  splitType: 'bank' | 'amount' | 'percentage' | 'remainder';
  splitValue?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Single prediction from ML Engine (can have multiple lines)
 */
export interface MLPrediction {
  rank: number;
  confidence: number;
  modelVersion: string;
  explanation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lines: MLPredictedLine[];
}

/**
 * Response from ML Engine API
 */
export interface MLPredictionResponse {
  success: boolean;
  predictions: MLPrediction[];
  modelVersion: string;
  latencyMs?: number;
  error?: string;
}
