import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteCompanyLogo,
  finalizeUploadIntent,
  getObjectDownloadUrl,
  getObjectUploadUrl,
  uploadCompanyLogo,
  uploadFileToR2,
} from '../api';
import {
  TRANSACTION_FILE_LIMITS,
  TRANSACTION_FILE_LIMITS_BYTES,
} from '../constants';

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

export function useRetrieveTxnFiles(companyId: string) {
  return useQuery({
    queryKey: ['txnFiles', companyId],
    // queryFn: () => getTxnFiles(companyId),
  });
}

export function useUploadCompanyLogo() {
  return useMutation({
    mutationFn: uploadCompanyLogo,
  });
}

export function useDeleteCompanyLogo() {
  return useMutation({
    mutationFn: deleteCompanyLogo,
  });
}

export function useUploadTransactionFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      files,
      transactionId,
      source,
      entryId,
    }: {
      companyId: string;
      files: File[];
      transactionId: string;
      source: 'ledger' | 'journal' | 'bank';
      entryId?: string | null;
    }) => {
      // Validate file count limit
      if (files.length > TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY) {
        throw new Error(
          `Maximum ${TRANSACTION_FILE_LIMITS.MAX_FILES_PER_ENTRY} files allowed per entry. Attempted to upload ${files.length} files.`,
        );
      }

      // Validate individual file sizes
      const oversizedFiles = files.filter(
        (file) => file.size > TRANSACTION_FILE_LIMITS_BYTES.MAX_FILE_SIZE_BYTES,
      );
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map((f) => f.name).join(', ');
        throw new Error(
          `File(s) exceed ${TRANSACTION_FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit: ${fileNames}`,
        );
      }

      // Validate total size limit
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > TRANSACTION_FILE_LIMITS_BYTES.MAX_TOTAL_SIZE_BYTES) {
        throw new Error(
          `Total file size exceeds ${TRANSACTION_FILE_LIMITS.MAX_TOTAL_SIZE_MB}MB limit per entry (${(totalSize / (1024 * 1024)).toFixed(2)}MB).`,
        );
      }

      for (const file of files) {
        // Get signed upload URL
        const uploadUrlResponse = await getObjectUploadUrl({
          companyId,
          bucketType: 'txnFiles',
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          metadata: {
            txnAttachment: {
              source,
              transactionId,
              entryId: entryId || null,
              folderContext: transactionId,
            },
          },
        });

        if (!uploadUrlResponse.success || !uploadUrlResponse.data) {
          throw new Error(
            uploadUrlResponse.message || 'Failed to get upload URL',
          );
        }

        const { intentId, signedUrl } = uploadUrlResponse.data;

        // Upload file to R2
        await uploadFileToR2(file, signedUrl);
        const finalizeResponse = await finalizeUploadIntent({
          companyId,
          intentId,
        });

        if (!finalizeResponse.success || !finalizeResponse.data) {
          throw new Error(
            finalizeResponse.message ||
              `Failed to finalize upload for ${file.name}`,
          );
        }
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['txnFiles', variables.companyId],
      });
    },
  });
}
