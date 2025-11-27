import z from 'zod';
import { dbBaseFields, debitCredit } from '../../../core/index.js';

export const candidateStatus = z.enum([
  'proposed',
  'validated',
  'rejected',
  'posted',
  'superseded',
]);
export type CandidateStatus = z.infer<typeof candidateStatus>;

export const candidateSplitType = z.enum([
  'bank',
  'amount',
  'percentage',
  'remainder',
]);
export type CandidateSplitType = z.infer<typeof candidateSplitType>;

export const categorizationCandidate = z.object({
  source: z.enum(['rule', 'ml']),
  prediction_id: z.uuid(),
  categorization_task_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: z.string(),
  company_id: z.uuid(),
  status: candidateStatus,
  posting_date: z.string().nullish(),
  confidence: z.number(),
  contact_id: z.uuid().nullable(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  solver_notes: z.string().nullable(),
  assignee_id: z.uuid().nullable(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullable(),
  ...dbBaseFields.shape,
});
export type CategorizationCandidate = z.infer<typeof categorizationCandidate>;

export const categorizationCandidateLine = z.object({
  candidate_id: z.uuid(),
  entry_type: debitCredit,
  coa_id: z.uuid(),
  project_id: z.uuid().nullable(),
  amount_native: z.number(),
  currency_code: z.string().length(3),
  description: z.string().nullable(),
  is_bank_leg: z.boolean(),
  split_type: candidateSplitType,
  split_value: z.number().nullable(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullable(),
  ...dbBaseFields.shape,
});
export type CategorizationCandidateLine = z.infer<
  typeof categorizationCandidateLine
>;

export const categorizationConstraintViolation = z.object({
  candidate_id: z.uuid(),
  violation_type: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  resolved: z.boolean(),
  metadata: z.record(z.string(), z.any()).nullable(),
  ...dbBaseFields.shape,
});
export type CategorizationConstraintViolation = z.infer<
  typeof categorizationConstraintViolation
>;
