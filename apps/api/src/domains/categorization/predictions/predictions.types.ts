import z from 'zod';
import { dbBaseFields } from '../../../core/index.js';

export const predictionSource = z.enum(['rule', 'ml']);
export type PredictionSource = z.infer<typeof predictionSource>;

export const predictionStatus = z.enum([
  'pending',
  'accepted',
  'rejected',
  'superseded',
]);
export type PredictionStatus = z.infer<typeof predictionStatus>;

export const predictionEntryType = z.enum(['debit', 'credit']);
export type PredictionEntryType = z.infer<typeof predictionEntryType>;

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
  explanation: z.record(z.string(), z.any()).nullish(),
  metadata: z.record(z.string(), z.any()).nullish(),
  ...dbBaseFields.shape,
});
export type CategorizationPrediction = z.infer<typeof categorizationPrediction>;

export const categorizationPredictionLine = z.object({
  prediction_id: z.uuid(),
  line_rank: z.number().int(),
  entry_type: predictionEntryType,
  coa_id: z.uuid(),
  project_id: z.uuid().nullable(),
  amount_native: z.number(),
  amount_reporting: z.number().nullable(),
  currency_code: z.string().length(3),
  description: z.string().nullable(),
  split_type: predictionSplitType,
  split_value: z.number().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  ...dbBaseFields.shape,
});
export type CategorizationPredictionLine = z.infer<
  typeof categorizationPredictionLine
>;
