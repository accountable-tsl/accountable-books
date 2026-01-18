import { z } from 'zod';

import { BUCKET_NAME_MAP } from './objects.registry.js';

export const objStorageProvider = z.enum([
  'cloudflare_r2',
  // 'aws_s3',
  // 'google_gcs',
  // 'backblaze_b2',
]);
export type ObjStorageProvider = z.infer<typeof objStorageProvider>;

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
});
export type ObjectUploadUrlParams = z.infer<typeof objectUploadUrlParams>;

export interface ObjectUploadUrlResponse {
  signedUrl: string;
  fileKey: string;
  bucketName: string;
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
