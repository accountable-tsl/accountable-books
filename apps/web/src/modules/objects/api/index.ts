import type {
  GetTxnFileInput,
  TransactionFiles,
} from '@accountable-books/contracts/schema';

import api from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';

import type {
  ObjectDownloadUrlParams,
  ObjectDownloadUrlResponse,
  ObjectUploadUrlParams,
  ObjectUploadUrlResponse,
  TxnFileInput,
  TxnFileResponse,
} from '../model/types';

export async function getObjectUploadUrl({
  companyId,
  ...params
}: ObjectUploadUrlParams): Promise<ApiResponse<ObjectUploadUrlResponse>> {
  const response = await api.post(
    `api/${companyId}/objects/url/upload`,
    params,
  );
  return response.data;
}

export async function getObjectDownloadUrl(
  params: ObjectDownloadUrlParams,
): Promise<ApiResponse<ObjectDownloadUrlResponse>> {
  const { bucketType, fileKey, timeout } = params;
  const queryParams = new URLSearchParams({
    bucketType,
    fileKey,
    timeout: timeout?.toString() ?? '',
  });
  const response = await api.get(
    `api/objects/url/download?${queryParams.toString()}`,
  );
  return response.data;
}

export async function uploadFileToR2(file: File, signedUrl: string) {
  // GetSignedUrl generates for uploads.
  const response = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      // It is critical that this matches the ContentType sent to the backend when generating the URL
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
  console.log({ R2Response: response });
  if (!response.ok) {
    throw new Error(`Upload failed with status: ${response.status}`);
  }

  return true;
}

export async function uploadTxnFile({
  companyId,
  data,
}: {
  companyId: string;
  data: TxnFileInput[];
}): Promise<ApiResponse<TxnFileResponse>> {
  const response = await api.post(`api/${companyId}/objects/txn-files`, data);
  return response.data;
}

export async function getTxnFiles(
  companyId: string,
  p: GetTxnFileInput[],
): Promise<ApiResponse<TransactionFiles[]>> {
  const response = await api.post(`api/${companyId}/objects/get-txn-files`, p);
  return response.data;
}
