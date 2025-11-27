import z from 'zod';
import { dbBaseFields, debitCredit } from '../../../core/index.js';
import type {
  ConditionTraceNode,
  ActionTraceNode,
} from '../rules/rules.compiler.js';

export const predictionSource = z.enum(['rule', 'ml']);
export type PredictionSource = z.infer<typeof predictionSource>;

export const predictionStatus = z.enum([
  'pending',
  'accepted',
  'rejected',
  'superseded',
]);
export type PredictionStatus = z.infer<typeof predictionStatus>;

export const predictionSplitType = z.enum([
  'bank',
  'amount',
  'percentage',
  'remainder',
]);
export type PredictionSplitType = z.infer<typeof predictionSplitType>;

export const categorizationPrediction = z.object({
  categorization_task_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: z.string(),
  company_id: z.uuid(),
  source: predictionSource,
  rank: z.number().int(),
  is_primary: z.boolean(),
  confidence: z.number(),
  model_version: z.string().nullish(),
  prediction_group_id: z.uuid().nullish(),
  status: predictionStatus,
  input_checksum: z.string().nullish(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullish(),
  ...dbBaseFields.shape,
});
export type CategorizationPrediction = z.infer<typeof categorizationPrediction>;

export const categorizationPredictionLine = z.object({
  prediction_id: z.uuid(),
  entry_type: debitCredit,
  coa_id: z.uuid(),
  project_id: z.uuid().nullable(),
  amount_native: z.number(),
  currency_code: z.string().length(3),
  description: z.string().nullable(),
  is_bank_leg: z.boolean(),
  split_type: predictionSplitType,
  split_value: z.number().nullable(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullable(),
  ...dbBaseFields.shape,
});
export type CategorizationPredictionLine = z.infer<
  typeof categorizationPredictionLine
>;

// ============================================
// PREDICTION METADATA TYPES
// ============================================

/**
 * Base metadata structure for all predictions
 * All prediction metadata must include provenance to identify the source
 */
export interface BasePredictionMetadata {
  provenance: 'rule_engine' | 'ml_engine';
  [key: string]: unknown; // Allow additional fields for extensibility
}

/**
 * Metadata structure for rule-based predictions
 * Contains structured information about which rule matched and how
 */
export interface RulePredictionMetadata extends BasePredictionMetadata {
  provenance: 'rule_engine';
  run_id: string;
  rule_id: string;
  rule_name?: string; // Human-readable rule name for easier access
  rule_details?: {
    matched_conditions: ConditionTraceNode[];
    applied_actions: ActionTraceNode[];
  };
}

/**
 * Metadata structure for ML-based predictions
 * Contains structured information about the ML model's decision-making
 */
export interface MLPredictionMetadata extends BasePredictionMetadata {
  provenance: 'ml_engine';
  overallExplanationTokens?: string[]; // Tokenized explanation for analysis
  model_version?: string; // Model version (also in main table, but useful for queries)
  // Future fields can include:
  // - confidence_breakdown?: Record<string, number>;
  // - feature_importance?: Record<string, number>;
  // - alternative_predictions?: Array<{...}>;
}

/**
 * Union type for all prediction metadata
 * Use this when you need to handle metadata from any source
 */
export type PredictionMetadata = RulePredictionMetadata | MLPredictionMetadata;
