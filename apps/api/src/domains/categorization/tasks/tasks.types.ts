import z, { check } from 'zod';
import { dbBaseFields, zDateYMD } from '../../../core/index.js';
import { enrichedTransaction } from '../enrichment/enrichment.types.js';
import type { Knex } from 'knex';
import {
  categorizationTaskSource,
  categorizationTaskStatus,
} from './tasks.enums.js';

export const newCategorizationTask = z.object({
  company_id: z.uuid(),
  bank_transaction_id: z.uuid(),
  bank_transaction_date: zDateYMD,
  enriched_transaction: enrichedTransaction,
  enrichment_version: z.string(),
  status: categorizationTaskStatus,
  source: categorizationTaskSource,
  checksum: z.string().max(64),
  metadata: z.any().nullish(),
});
export type NewCategorizationTask = z.infer<typeof newCategorizationTask>;

export const categorizationTask = z.object({
  ...newCategorizationTask.shape,
  ...dbBaseFields.shape,
});
export type CategorizationTask = z.infer<typeof categorizationTask>;

export type NewCategorizationTaskInput = Omit<
  NewCategorizationTask,
  'company_id'
> & {
  company_uuid: string;
  trx?: Knex.Transaction;
  jobId?: string;
};
