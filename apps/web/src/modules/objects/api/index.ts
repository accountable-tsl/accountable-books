import type { ApiResponse } from '@/shared/types/core';
import type {
  GetTxnFileInput,
  TransactionFiles,
} from '@accountable-books/contracts/schema';
import api from '@/lib/axios';

import type {
  CreateUploadIntentParams,
  CreateUploadIntentResponse,
  FinalizeUploadIntentParams,
  FinalizeUploadIntentResponse,
  ObjectDownloadUrlParams,
  ObjectDownloadUrlResponse,
  ObjectUploadUrlParams,
  ObjectUploadUrlResponse,
  TxnFileInput,
  TxnFileResponse,
} from '../model/types';

export async function createUploadIntent({
  companyId,
  ...params
}: CreateUploadIntentParams): Promise<ApiResponse<CreateUploadIntentResponse>> {
  const response = await api.post(
    `api/${companyId}/files/upload-intents`,
    params,
  );
  return response.data;
}

export async function finalizeUploadIntent({
  companyId,
  ...params
}: FinalizeUploadIntentParams): Promise<
  ApiResponse<FinalizeUploadIntentResponse>
> {
  const response = await api.post(`api/${companyId}/files/finalize`, params);
  return response.data;
}

export async function getObjectUploadUrl({
  companyId,
  ...params
}: ObjectUploadUrlParams): Promise<ApiResponse<ObjectUploadUrlResponse>> {
  const response = await createUploadIntent({
    companyId,
    purpose: 'txn_attachment',
    fileName: params.fileName,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
    metadata: params.metadata,
  });

  if (!response.success || !response.data) {
    return {
      success: false,
      message: response.message || 'Failed to create upload intent',
      error: response.error,
      code: response.code,
    };
  }

  return {
    success: true,
    message: response.message,
    data: {
      intentId: response.data.intentId,
      signedUrl: response.data.uploadUrl,
      fileKey: response.data.fileKey,
      bucketName: response.data.bucketName,
      url: response.data.url,
    },
  };
}

export async function getObjectDownloadUrl(
  params: ObjectDownloadUrlParams,
): Promise<ApiResponse<ObjectDownloadUrlResponse>> {
  const { companyId, bucketType, fileKey, timeout } = params;
  const queryParams = new URLSearchParams({
    bucketType,
    fileKey,
    timeout: timeout?.toString() ?? '',
  });
  const response = await api.get(
    `api/${companyId}/files/url/download?${queryParams.toString()}`,
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
  if (!response.ok) {
    throw new Error(`Upload failed with status: ${response.status}`);
  }

  return true;
}

export async function uploadCompanyLogo({
  companyId,
  file,
}: {
  companyId: string;
  file: File;
}): Promise<ApiResponse<{ fileId: string; url: string; key: string }>> {
  const intent = await createUploadIntent({
    companyId,
    purpose: 'company_logo',
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  if (!intent.success || !intent.data) {
    return {
      success: false,
      message: intent.message || 'Failed to create upload intent',
      error: intent.error,
      code: intent.code,
    };
  }

  await uploadFileToR2(file, intent.data.uploadUrl);

  const finalized = await finalizeUploadIntent({
    companyId,
    intentId: intent.data.intentId,
  });

  if (!finalized.success || !finalized.data) {
    return {
      success: false,
      message: finalized.message || 'Failed to finalize company logo upload',
      error: finalized.error,
      code: finalized.code,
    };
  }

  return {
    success: true,
    message: finalized.message,
    data: {
      fileId: finalized.data.fileId,
      url: finalized.data.url,
      key: finalized.data.key,
    },
  };
}

export async function deleteCompanyLogo(
  companyId: string,
): Promise<ApiResponse<null>> {
  const response = await api.delete(`api/${companyId}/company-logo`);
  return response.data;
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
