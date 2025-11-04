import z, { check } from 'zod';
import { dbBaseFields, zDateYMD } from '../../../core/index.js';
import { enrichedTransactionSchema } from '../enrichment/enrichment.types.js';

export const categorizationTaskStatus = z.enum([
  'enriched',
  'partial',
  'failed',
  'pending',
]);
export type CategorizationTaskStatus = z.infer<typeof categorizationTaskStatus>;

export const categorizationTaskSource = z.enum([
  'ingestion',
  'backfill',
  'manual',
]);
export type CategorizationTaskSource = z.infer<typeof categorizationTaskSource>;

export const newCategorizationTask = z.object({
  company_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: zDateYMD,
  enriched_transaction: enrichedTransactionSchema,
  enrichment_version: z.string().min(1).max(20),
  status: categorizationTaskStatus,
  source: categorizationTaskSource,
  checksum: z.string().max(64).nullish(),
});
export type NewCategorizationTask = z.infer<typeof newCategorizationTask>;

export const categorizationTask = z.object({
  ...newCategorizationTask.shape,
  ...dbBaseFields.shape,
});
export type CategorizationTask = z.infer<typeof categorizationTask>;
