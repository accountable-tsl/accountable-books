import { useQuery } from '@tanstack/react-query';
import { getObjectDownloadUrl, getObjectUploadUrl } from '../api';
import type { ObjectDownloadUrlParams, ObjectUploadUrlParams } from './types';

export function useObjectUploadUrl(params: ObjectUploadUrlParams) {
  return useQuery({
    queryKey: ['objectUploadUrl', params],
    queryFn: () => getObjectUploadUrl(params),
  });
}

export function useObjectDownloadUrl(params: ObjectDownloadUrlParams) {
  return useQuery({
    queryKey: ['objectDownloadUrl', params],
    queryFn: () => getObjectDownloadUrl(params),
  });
}
