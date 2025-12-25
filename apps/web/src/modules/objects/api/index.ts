import api from '@/lib/axios';
import type {
  ObjectDownloadUrlParams,
  ObjectDownloadUrlResponse,
  ObjectUploadUrlParams,
  ObjectUploadUrlResponse,
} from '../model/types';
import type { ApiResponse } from '@/shared/types/core';

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
  const response = await api.get(`api/objects/url/download?${queryParams.toString()}`);
  return response.data;
}
