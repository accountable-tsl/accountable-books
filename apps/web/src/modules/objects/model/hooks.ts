import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getObjectDownloadUrl,
  getObjectUploadUrl,
  uploadFileToR2,
  uploadTxnFile,
} from '../api';
import { txnFileInput } from './types';

import type {
  ObjectDownloadUrlParams,
  ObjectUploadUrlParams,
  TxnFileInput,
} from './types';

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
      const txnFileInputs: TxnFileInput[] = [];

      for (const file of files) {
        console.log({file});
        // Get signed upload URL
        const uploadUrlResponse = await getObjectUploadUrl({
          companyId,
          bucketType: 'txnFiles',
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          folderContext: transactionId,
        });

        if (!uploadUrlResponse.success || !uploadUrlResponse.data) {
          throw new Error(
            uploadUrlResponse.message || 'Failed to get upload URL',
          );
        }

        const { signedUrl, fileKey, bucketName } = uploadUrlResponse.data;

        // Upload file to R2
        await uploadFileToR2(file, signedUrl);

        // Construct URL (using download URL pattern - can be replaced with public URL if available)
        const url = `https://${bucketName}/${fileKey}`;

        // Build TxnFileInput
        txnFileInputs.push({
          name: file.name,
          key: fileKey,
          bucket_name: bucketName,
          url,
          type: file.type || 'application/octet-stream',
          size_bytes: BigInt(file.size),
          checksum: null,
          provider: 'cloudflare_r2',
          region: null,
          endpoint: null,
          source,
          transaction_id: transactionId,
          entry_id: entryId || null,
        });
      }

      // Persist all transaction files
      const validatedData = txnFileInput.array().parse(txnFileInputs);
      return uploadTxnFile({ companyId, data: validatedData });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['txnFiles', variables.companyId],
      });
    },
  });
}
