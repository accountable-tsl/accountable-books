import { z } from 'zod';

export const objStorageProvider = z.enum([
  'cloudflare_r2',
  // 'aws_s3',
  // 'google_gcs',
  // 'backblaze_b2',
]);
export type ObjStorageProvider = z.infer<typeof objStorageProvider>;

export const txnFileSource = z.enum(['ledger', 'journal', 'bank']);
export type TxnFileSource = z.infer<typeof txnFileSource>;

export const getTxnFileInput = z
  .object({
    id: z.string().optional(),
    source: txnFileSource,
    key: z.string().optional(),
    transactionId: z.string().optional(),
    entryId: z.string().optional(),
    companyId: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'bank') {
      if (data?.entryId) {
        ctx.addIssue({
          code: 'custom',
          message: 'entryId is not allowed for bank source',
        });
      }
    }
  });
export type GetTxnFileInput = z.infer<typeof getTxnFileInput>;

export const txnFileInput = z
  .object({
    id: z.uuid().optional(),
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
    source: txnFileSource,
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
