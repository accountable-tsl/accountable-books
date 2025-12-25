import { z } from 'zod';
import { objStorageProvider } from '../objects.types.js';

export const txnFileInput = z
  .object({
    name: z.string().max(512),
    key: z.string().max(1024),
    bucket_name: z.string(),
    url: z.url(),
    type: z.string(),
    size_bytes: z.coerce.bigint(),
    checksum: z.string().max(64).nullish(),
    provider: objStorageProvider.default('cloudflare_r2').optional(),
    region: z.string().nullish(),
    endpoint: z.string().nullish(),
    source: z.enum(['ledger', 'journal', 'bank']),
    transaction_id: z.uuid(),
    entry_id: z.uuid().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'bank') {
      if (data.entry_id) {
        ctx.addIssue({
          code: 'custom',
          message: 'entry_id must be null when source is bank',
        });
      }
    }
  });

export type TxnFileInput = z.infer<typeof txnFileInput>;

export const newTxnFile = z.object({
  ...txnFileInput.shape,
  company_id: z.uuid(),
  uploaded_by_id: z.uuid(),
});
export type NewTxnFile = z.infer<typeof newTxnFile>;

export const transactionFiles = z.object({
  ...newTxnFile.shape,
  id: z.uuid(),
  uploaded_at: z.date().or(z.iso.datetime()),
  is_deleted: z.boolean().default(false),
  deleted_at: z.date().nullish(),
  deleted_by_id: z.uuid().nullish(),
});

export type TransactionFiles = z.infer<typeof transactionFiles>;
