import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadBankTransactions } from "./bank-tx-api";
import { BankTransactionBatchInsert } from "./manual-upload/types";
import { toast } from "sonner";

const genQueryKey = (companyId: string) => ["bank-transactions", companyId];
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
    onSuccess: (response, variables) => {
      invalidateQueries(queryClient, variables.companyId);
      const { message } = response;
      toast.success(message || "Transactions uploaded successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload transactions");
    },
  });
}
