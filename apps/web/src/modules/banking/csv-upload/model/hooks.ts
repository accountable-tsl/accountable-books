import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type BankTransactionBatchInsert } from './types';
import { toast } from 'sonner';
import { uploadBankTransactions } from '../api';

const genQueryKey = (companyId: string) => ['bank-transactions', companyId];
const invalidateQueries = (queryClient: any, companyId: string) => {
  queryClient.invalidateQueries({
    queryKey: genQueryKey(companyId),
    exact: false,
  });
};

export function useUploadBankTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      companyId: string;
      data: BankTransactionBatchInsert;
    }) => uploadBankTransactions(input.companyId, input.data),
    // onSuccess: (response, variables) => {
    //   invalidateQueries(queryClient, variables.companyId);
    //   const { message } = response;
    //   toast.success(message || 'Transactions uploaded successfully');
    // },
    onSuccess: (_, variables) => {
      invalidateQueries(queryClient, variables.companyId);
    },
    // onError: (error) => {
    //   toast.error(error.message || 'Failed to upload transactions');
    // },
  });
}
