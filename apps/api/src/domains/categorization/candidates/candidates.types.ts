import { contactType } from '@accountable-books/contracts/schema';
import z from 'zod';

import {
  dbBaseFields,
  dbStandardFields,
  debitCredit,
} from '../../../core/index.js';
import { txnCategorizationSource } from '../categorization.types.js';

export const candidateSplitType = z.enum(['amount', 'percentage', 'remainder']);
export type CandidateSplitType = z.infer<typeof candidateSplitType>;

const candidateLineDraft = z.object({
  fs_date: z.string(),
  transaction_side: debitCredit,
  coa_id: z.uuid(),
  coa_name: z.string().nullish(),
  project_id: z.uuid().nullish(),
  project_name: z.string().nullish(),
  contact_id: z.uuid().nullish(),
  contact_type: contactType.nullish(),
  contact_name: z.string().nullish(),
  source_currency_id: z.uuid(),
  system_exchange_rate: z.number(),
  custom_exchange_rate: z.number(),
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

export const candidateInput = z.object({
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
  explanation: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullable(),

  candidate_lines: z.array(candidateLineDraft).min(2),

  solver_notes: z.string().nullish(),
  assignee_id: z.uuid().nullish(),
});
export type CandidateInput = z.infer<typeof candidateInput>;

const newCandidate = z.object({
  ...candidateInput.omit({ candidate_lines: true }).shape,
  ...dbStandardFields.shape,
});

export const categorizationCandidate = z.object({
  ...newCandidate.shape,
  id: z.uuid(),
  signed_reporting_amount: z.number(),
});

export type CategorizationCandidate = z.infer<typeof categorizationCandidate>;

export const updateCandidateInput = z
  .object({
    contact_id: z.uuid(),
    contact_name: z.string(),
    contact_type: contactType,
    description: z.string(),
    solver_notes: z.string(),
    assignee_id: z.uuid(),
  })
  .partial()
  .extend({
    candidate_id: z.uuid(),
  });
export type UpdateCandidateInput = z.infer<typeof updateCandidateInput>;

// Types for getCategorizationCandidatesWithLines
export type CategorizationCandidateWithLines = CategorizationCandidate & {
  lines: CategorizationCandidateLine[];
};

export type CategorizationCandidateWithLinesFiltered = Omit<
  CategorizationCandidate,
  'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'
> & {
  lines: Array<
    Omit<
      CategorizationCandidateLine,
      'created_at' | 'updated_at' | 'is_deleted' | 'deleted_at'
    >
  >;
};
