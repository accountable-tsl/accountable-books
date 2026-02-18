import type { MimeType } from '@/shared/constants/filetype';
import z from 'zod';

export type ObjectBucket = 'logos' | 'txnFiles';

export interface ObjectUploadUrlParams {
  companyId: string;
  bucketType: ObjectBucket;
  fileName: string;
  contentType: MimeType;
  folderContext?: string;
}

export interface ObjectUploadUrlResponse {
  signedUrl: string;
  fileKey: string;
  bucketName: string;
  /** Canonical object URL stored in DB. Use signed download URL for viewing. */
  url: string;
}

export interface ObjectDownloadUrlParams {
  bucketType: ObjectBucket;
  fileKey: string;
  timeout?: number;
}

export interface ObjectDownloadUrlResponse {
  url: string;
  expiry: number;
}

export const txnFileInput = z
  .object({
    name: z.string().max(512),
    key: z.string().max(1024),
    bucket_name: z.string(),
    url: z.url(),
    type: z.string(),
    // Keep as number for JSON compatibility (BigInt cannot be JSON-stringified).
    size_bytes: z.coerce.number().int().nonnegative(),
    checksum: z.string().max(64).nullish(),
    provider: z.literal('cloudflare_r2'),
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

export type TxnFileResponse = Array<{
  id: string;
  key: string;
  name: string;
  url: string;
  type: string;
  bucket_name: string;
  size_bytes: number;
  transaction_id: string;
  entry_id?: string | null;
}>;
