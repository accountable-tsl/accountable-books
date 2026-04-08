import { z } from 'zod';

import { BUCKET_NAME_MAP } from './objects.registry.js';

export const objStorageProvider = z.enum([
  'cloudflare_r2',
  // 'aws_s3',
  // 'google_gcs',
  // 'backblaze_b2',
]);
export type ObjStorageProvider = z.infer<typeof objStorageProvider>;

export const fileUploadPurpose = z.enum(['company_logo', 'txn_attachment']);
export type FileUploadPurpose = z.infer<typeof fileUploadPurpose>;

export const uploadIntentStatus = z.enum([
  'pending',
  'finalized',
  'cancelled',
  'expired',
]);
export type UploadIntentStatus = z.infer<typeof uploadIntentStatus>;

export const logoUploadParams = z.object({
  file: z.instanceof(Buffer),
  originalFilename: z.string(),
  mimeType: z.string(),
  companyId: z.string().min(1, 'Company ID is required'),
});

export type LogoUploadParams = z.infer<typeof logoUploadParams>;

export const objectTypes = ['logos', 'transaction_files'] as const; //"profile_avatar", "document"
// export type ObjectBucket = (typeof objectTypes)[number];

export interface UploadRequestBody {
  objectType: ObjectBucket;
  companyId?: string;
  userId?: string;
  [key: string]: any;
}

const BUCKET_KEYS = Object.keys(BUCKET_NAME_MAP) as [
  keyof typeof BUCKET_NAME_MAP,
  ...Array<keyof typeof BUCKET_NAME_MAP>,
];
export const objectBucket = z.enum(BUCKET_KEYS);

export type ObjectBucket = keyof typeof BUCKET_NAME_MAP;

export const objectUploadUrlParams = z.object({
  companyId: z.string(),
  bucketType: objectBucket,
  fileName: z.string(),
  contentType: z.string(),
  folderContext: z.string().optional(),
  fileKey: z.string().optional(),
});
export type ObjectUploadUrlParams = z.infer<typeof objectUploadUrlParams>;

export interface ObjectUploadUrlResponse {
  signedUrl: string;
  fileKey: string;
  bucketName: string;
  /**
   * Canonical object URL to store in DB. Not necessarily publicly accessible.
   * Viewing should be done via signed download URL.
   */
  url: string;
}

export const objectDownloadUrlParams = z.object({
  bucketType: objectBucket,
  fileKey: z.string(),
  timeout: z.number(),
});
export type ObjectDownloadUrlParams = z.infer<typeof objectDownloadUrlParams>;

export interface ObjectDownloadUrlResponse {
  url: string;
  expiry: number;
}

export const txnAttachmentMetadata = z
  .object({
    source: z.enum(['ledger', 'journal', 'bank']).optional(),
    transactionId: z.uuid().optional(),
    entryId: z.uuid().nullish(),
    folderContext: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transactionId && !value.source) {
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Attachment source is required when transactionId is provided',
      });
    }
  });
export type TxnAttachmentMetadata = z.infer<typeof txnAttachmentMetadata>;

export const fileUploadIntentMetadata = z
  .object({
    txnAttachment: txnAttachmentMetadata.optional(),
  })
  .optional();
export type FileUploadIntentMetadata = z.infer<typeof fileUploadIntentMetadata>;

export const createUploadIntentParams = z
  .object({
    companyId: z.string().min(1),
    purpose: fileUploadPurpose,
    fileName: z.string().trim().min(1).max(512),
    contentType: z.string().trim().min(1).max(255),
    sizeBytes: z.coerce.number().int().positive(),
    metadata: fileUploadIntentMetadata,
  })
  .superRefine((value, ctx) => {
    if (value.purpose === 'txn_attachment' && !value.metadata?.txnAttachment) {
      ctx.addIssue({
        code: 'custom',
        path: ['metadata', 'txnAttachment'],
        message: 'Transaction attachment metadata is required',
      });
    }
  });
export type CreateUploadIntentParams = z.infer<typeof createUploadIntentParams>;

export const finalizeUploadIntentParams = z.object({
  companyId: z.string().min(1),
  intentId: z.uuid(),
  checksum: z.string().trim().max(128).nullish(),
});
export type FinalizeUploadIntentParams = z.infer<
  typeof finalizeUploadIntentParams
>;

export interface CreateUploadIntentResponse {
  intentId: string;
  purpose: FileUploadPurpose;
  uploadUrl: string;
  fileKey: string;
  bucketName: string;
  url: string;
  expiresAt: string;
}

export interface FinalizeUploadIntentResponse {
  fileId: string;
  purpose: FileUploadPurpose;
  key: string;
  url: string;
}

export interface FileRecord {
  id: string;
  name: string;
  key: string;
  bucket_name: string;
  url: string;
  mime_type: string;
  size_bytes: string | number;
  checksum: string | null;
  provider: ObjStorageProvider;
  region: string | null;
  endpoint: string | null;
  company_id: string;
  uploaded_by_id: string;
  uploaded_at: Date;
  created_at?: Date;
  updated_at?: Date;
  is_deleted?: boolean;
  deleted_at?: Date | null;
  deleted_by_id?: string | null;
}

export interface NewFileRecord extends Omit<FileRecord, 'id' | 'uploaded_at'> {
  id?: string;
  uploaded_at?: Date;
}

export interface UploadIntentRecord {
  id: string;
  company_id: string;
  requested_by_id: string;
  purpose: FileUploadPurpose;
  bucket_name: string;
  file_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: string | number;
  status: UploadIntentStatus;
  metadata: FileUploadIntentMetadata | null;
  expires_at: Date;
  finalized_at: Date | null;
  consumed_at: Date | null;
  cancelled_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface NewUploadIntentRecord
  extends Omit<
    UploadIntentRecord,
    'id' | 'finalized_at' | 'consumed_at' | 'cancelled_at'
  > {
  id?: string;
  finalized_at?: Date | null;
  consumed_at?: Date | null;
  cancelled_at?: Date | null;
}
