import { z } from 'zod';
import { versionPattern } from './enrichment.js';
import { labelRole } from '../common/enums.js';
import { accountTypeKeys as accountTypeKeysData } from '../../../data/source/account/account-types.js';

export const accountTypeKeys = z.enum(accountTypeKeysData);
export type AccountTypeKeys = z.infer<typeof accountTypeKeys>;

export const intentSemanticEntry = z.object({
  key: accountTypeKeys, // account_type_key - type-safe to actual account type keys
  prob: z.number(), // probability
  label_role: labelRole, // type-safe to valid label role values
});

export const globalIntentClassifier = z.object({
  model_name: z.literal('global_intent_classifier'),
  model_version: z.regex(versionPattern),
  latency_ms: z.number(),

  semantic_top1: z.string(),
  semantic_top1_prob: z.number(),

  semantic_top_k: z.array(intentSemanticEntry),

  shap_values: z.record(z.string(), z.number()),

  feature_mapping_version: z.string(),
});
export type GlobalIntentClassifier = z.infer<typeof globalIntentClassifier>;

export const reasonEnum = z.enum([
  'history',
  'embedding_match',
  'semantic_intent',
]);
export const rankerEntry = z.object({
  account_id: z.uuid(),
  account_label: z.string(),
  score: z.number(),
  reason: reasonEnum,
});

export const rankerExplanation = z.object({
  reason: reasonEnum,
  message: z.string(),
});

export const tenantAccountRanker = z.object({
  model_name: z.literal('tenant_account_ranker'),
  model_version: z.regex(versionPattern),
  latency_ms: z.number(),

  selected_account_id: z.uuid(),
  selected_account_label: z.string(),
  selected_account_score: z.number(),

  ranking_top_k: z.array(rankerEntry),
  explanation: rankerExplanation,
  shap_values: z.record(z.string(), z.number()),
  feature_mapping_version: z.string(),
});

export type TenantAccountRankerOutput = z.infer<typeof tenantAccountRanker>;

export const finalPosting = z.object({
  account_id: z.uuid(),
  account_label: z.string(),
});

// Accrual Resolver schemas
export const accrualRecommendation = z.object({
  account_id: z.uuid(),
  account_label: z.string(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  method: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AccrualRecommendation = z.infer<typeof accrualRecommendation>;

export const accrualResolverOutput = z.object({
  should_accrue: z.boolean(),
  confidence: z.number().min(0).max(1),
  top_n_recommendations: z.array(accrualRecommendation),
  top_1_recommendation: accrualRecommendation.nullable(),
  fallback_used: z.boolean(),
  explanation: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AccrualResolverOutput = z.infer<typeof accrualResolverOutput>;

export const mlPredictionOutput = z.object({
  final_posting: finalPosting,
  global_intent_classifier: globalIntentClassifier,
  tenant_account_ranker: tenantAccountRanker,
  accrual_resolver: accrualResolverOutput.optional(),
});

export type MLPredictionOutput = z.infer<typeof mlPredictionOutput>;

// // We might have to remove everything beyond this point
// /**
//  * Individual journal line predicted by ML Engine
//  *
//  * Note: Exchange rate conversion (amountReporting) is not part of predictions.
//  * Exchange rates are calculated at posting time when creating ledger entries.
//  */
// export const mlPredictedLineSchema = z.object({
//   entryType: z.enum(['debit', 'credit']),
//   coaId: z.uuid(),
//   projectId: z.uuid().nullable().optional(),
//   amountNative: z.number(),
//   currencyCode: z.string().length(3),
//   description: z.string().nullable().optional(),
//   isBankLeg: z.boolean().optional(),
//   splitType: z.enum(['bank', 'amount', 'percentage', 'remainder']),
//   splitValue: z.number().nullable().optional(),
//   explanation: z.string().optional(),
//   explanationTokens: z.array(z.string()).optional(),
//   metadata: z.record(z.string(), z.unknown()).nullable().optional(),
// });

// export type MLPredictedLine = z.infer<typeof mlPredictedLineSchema>;

// /**
//  * Single prediction from ML Engine (can have multiple lines)
//  */
// export const mlPredictionSchema = z.object({
//   id: z.uuid(),
//   rank: z.number().int().positive(),
//   confidence: z.number().min(0).max(1),
//   modelVersion: z.string(),
//   overallExplanation: z.string(),
//   overallExplanationTokens: z.array(z.string()).optional(),
//   metadata: z.record(z.string(), z.unknown()).nullable().optional(),
//   lines: z.array(mlPredictedLineSchema),

//   // Compute these three fields from ground-truth lines
//   // Include them in target + normal loss (no masking)
//   // model can never output unbalanced entries without paying heavy loss.
//   netAmountNative: z.literal(0),
//   debitTotalNative: z.number(),
//   creditTotalNative: z.number(),
// });

// export type MLPrediction = z.infer<typeof mlPredictionSchema>;

// /**
//  * Response from ML Engine API
//  */
// export const mlPredictionResponseSchema = z.object({
//   success: z.boolean(),
//   predictions: z.array(mlPredictionSchema),
//   modelVersion: z.string(),
//   latencyMs: z.number().int().nonnegative().optional(),
//   error: z.string().optional(),
//   debug: z.record(z.string(), z.any()).optional(),
// });

// export type MLPredictionResponse = z.infer<typeof mlPredictionResponseSchema>;
