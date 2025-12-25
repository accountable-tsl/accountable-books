import type { MimeType } from '@/shared/constants/filetype';

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
