import {
  mlPredictionOutput,
  tenantAccountRanker,
} from '@accountable-books/contracts/schema';
import z from 'zod';

import { dbBaseFields, zDateYMD } from '../../../../core/index.js';
import { contactType } from '../../../contacts/contacts.types.js';
import { txnCategorizationSource } from '../../categorization.types.js';
import { actionTraceNode, conditionTraceNode } from '../../rules/index.js';

export const predictionStatus = z.enum([
  'pending',
  'accepted',
  'rejected',
  'superseded',
]);
export type PredictionStatus = z.infer<typeof predictionStatus>;

const newPrediction = z.object({
  categorization_task_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: zDateYMD,
  run_id: z.uuid(),
  company_id: z.uuid(),
  source: txnCategorizationSource,
  contact_id: z.uuid().nullish(),
  contact_type: contactType.nullish(),
  description: z.string().nullish(),
  reference: z.string().nullish(),
  ledger_date: zDateYMD.nullish(),
  confidence: z.number().min(0).max(1),
  model_version: z.string().nullish(),
  // input_checksum: z.string().nullish(),
  explanation: z.string().nullish(),
  explanation_tokens: z.array(z.string()).nullish(),
  metadata: z.record(z.string(), z.any()).nullish(),
});

export const prediction = z.object({
  ...newPrediction.shape,
  ...dbBaseFields.shape,
});
export type Prediction = z.infer<typeof prediction>;

export const newPredictionLine = z.object({
  prediction_id: z.uuid(),
  coa_id: z.uuid(),
  project_id: z.uuid().nullish(),
  contact_id: z.uuid().nullish(),
  contact_type: contactType.nullish(),
  signed_native_amount: z.number(),
  description: z.string().nullable(),
  is_bank_leg: z.boolean(),
  explanation: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type NewPredictionLine = z.infer<typeof newPredictionLine>;
export const predictionLine = z.object({
  ...newPredictionLine.shape,
  ...dbBaseFields.shape,
});

export type PredictionLine = z.infer<typeof predictionLine>;

// Prediction Metadata

/**
 * Base Prediction Metadata
 */
export const basePredictionMetadata = z.looseObject({
  provenance: z.enum(['rule_engine', 'ml_engine']),
});
export type BasePredictionMetadata = z.infer<typeof basePredictionMetadata>;

/**
 * Rule Prediction Metadata
 */
const ruleDetails = z.object({
  matched_conditions: z.array(conditionTraceNode),
  applied_actions: z.array(actionTraceNode),
});

const appliedRule = z.object({
  rule_id: z.string(),
  rule_name: z.string().nullish(),
  rule_details: ruleDetails.nullish(),
});

export const rulePredictionMetadata = z.object({
  ...basePredictionMetadata.shape,
  provenance: z.literal('rule_engine'),
  run_id: z.string(),
  rule_ids: z.array(z.string()),
  rules: z.array(appliedRule),
});

export type RulePredictionMetadata = z.infer<typeof rulePredictionMetadata>;

/**
 * Metadata structure for ML-based predictions
 */
export const mlPredictionMetadata = z.object({
  ...basePredictionMetadata.shape,
  ...mlPredictionOutput.shape,
  provenance: z.literal('ml_engine'),
  explanation: tenantAccountRanker.shape.explanation,
  explanation_tokens: z.array(z.string()).optional(), // Derived
});

export type MLPredictionMetadata = z.infer<typeof mlPredictionMetadata>;

/**
 * Union type for all prediction metadata
 * Use this when you need to handle metadata from any source
 */
export const predictionMetadata = z.discriminatedUnion('provenance', [
  rulePredictionMetadata,
  mlPredictionMetadata,
]);
export type PredictionMetadata = z.infer<typeof predictionMetadata>;

export const persistPredictionParams = z.strictObject({
  prediction: newPrediction,
  predictionLines: z
    .array(newPredictionLine.omit({ prediction_id: true }))
    .min(1),
});
export type PersistPredictionParams = z.infer<typeof persistPredictionParams>;

export const updatePredictionParams = z.object({
  predictionId: z.uuid(),
  status: predictionStatus,
  statusReason: z.string().nullish(),
  metadata: z
    .discriminatedUnion('provenance', [
      rulePredictionMetadata.partial(),
      mlPredictionMetadata.partial(),
    ])
    .optional(),
  metadataAction: z.enum(['update', 'replace']).optional().default('update'),
});
export type UpdatePredictionParams = z.infer<typeof updatePredictionParams>;
