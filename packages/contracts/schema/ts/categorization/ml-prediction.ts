import { z } from 'zod';
import { enrichedTransactionSchema } from './enrichment.js';

/**
 * Request payload sent to ML Engine API
 */
export const mlPredictionRequestSchema = z.object({
  enrichedTransaction: enrichedTransactionSchema,
});

export type MLPredictionRequest = z.infer<typeof mlPredictionRequestSchema>;

/**
 * Individual journal line predicted by ML Engine
 *
 * Note: Exchange rate conversion (amountReporting) is not part of predictions.
 * Exchange rates are calculated at posting time when creating ledger entries.
 */
export const mlPredictedLineSchema = z.object({
  entryType: z.enum(['debit', 'credit']),
  coaId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  amountNative: z.number(),
  currencyCode: z.string().length(3),
  description: z.string().nullable().optional(),
  isBankLeg: z.boolean().optional(),
  splitType: z.enum(['bank', 'amount', 'percentage', 'remainder']),
  splitValue: z.number().nullable().optional(),
  explanation: z.string().optional(),
  explanationTokens: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type MLPredictedLine = z.infer<typeof mlPredictedLineSchema>;

/**
 * Single prediction from ML Engine (can have multiple lines)
 */
export const mlPredictionSchema = z.object({
  id: z.uuid(),
  rank: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  overallExplanation: z.string(),
  overallExplanationTokens: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  lines: z.array(mlPredictedLineSchema),

  // Compute these three fields from ground-truth lines
  // Include them in target + normal loss (no masking)
  // model can never output unbalanced entries without paying heavy loss.
  netAmountNative: z.literal(0),
  debitTotalNative: z.number(),
  creditTotalNative: z.number(),
});

export type MLPrediction = z.infer<typeof mlPredictionSchema>;

/**
 * Response from ML Engine API
 */
export const mlPredictionResponseSchema = z.object({
  success: z.boolean(),
  predictions: z.array(mlPredictionSchema),
  modelVersion: z.string(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  debug: z.record(z.string(), z.any()).optional(),
});

export type MLPredictionResponse = z.infer<typeof mlPredictionResponseSchema>;
