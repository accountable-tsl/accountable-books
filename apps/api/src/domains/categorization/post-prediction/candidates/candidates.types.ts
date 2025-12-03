import z from 'zod';
import {
  dbBaseFields,
  dbStandardFields,
  debitCredit,
} from '../../../../core/index.js';
import { categorizationStatus } from '../../../../core/index.js';
import { txnCategorizationSource } from '../../categorization.types.js';
import { contactType } from '../../../../../../../packages/contracts/accountable_contracts/schema/source/common/index.js';

export const candidateSplitType = z.enum(['amount', 'percentage', 'remainder']);
export type CandidateSplitType = z.infer<typeof candidateSplitType>;

const candidateLineDraft = z.object({
  fs_date: z.string(),
  status: categorizationStatus,
  transaction_side: debitCredit,
  coa_id: z.uuid(),
  project_id: z.uuid().nullish(),
  // currency_code: z.string().length(3).optional(),
  source_currency_id: z.uuid(),
  system_exchange_rate: z.number(),
  signed_native_amount: z.number(),
  description: z.string().nullish(),
  is_bank_leg: z.boolean(),
  split_type: candidateSplitType.nullish(),
  split_value: z.number().nullish(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullish(),
});
export type CandidateLineDraft = z.infer<typeof candidateLineDraft>;

const newCandidateLine = z.object({
  ...candidateLineDraft.shape,
  candidate_id: z.uuid(),
});

export const categorizationCandidateLine = z.object({
  ...newCandidateLine.shape,
  ...dbBaseFields.shape,
});
export type CategorizationCandidateLine = z.infer<
  typeof categorizationCandidateLine
>;

const candidateInput = z.object({
  source: txnCategorizationSource,
  categorization_task_id: z.uuid(),
  prediction_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: z.string(),
  company_id: z.uuid(),
  contact_id: z.uuid().nullable(),
  contact_type: contactType.nullish(),
  reference: z.string().nullish(),
  description: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  solver_notes: z.string().nullish(),
  assignee_id: z.uuid().nullable(),
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullable(),
  candidate_lines: z.array(candidateLineDraft).min(2),
});

const newCandidate = z.object({
  ...candidateInput.omit({ candidate_lines: true }).shape,
  ...dbStandardFields.shape,
});

export const categorizationCandidate = z.object({
  ...newCandidate.shape,
  id: z.uuid(),
});

export type CategorizationCandidate = z.infer<typeof categorizationCandidate>;

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
