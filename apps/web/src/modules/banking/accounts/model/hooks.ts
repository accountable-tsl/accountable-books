import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBankAccountsForCompany, updateBankAccounts } from '@/modules/banking/accounts/api';
import { toast } from 'sonner';

// Reusable invalidation function
export const invalidateBankAccounts = (queryClient: any, companyId: string) => {
  queryClient.invalidateQueries({ queryKey: ['bank-accounts', companyId] });
};

// use query to fetch bank accounts
export const useCompanyBankAccounts = (companyId: string) => {
  return useQuery({
    queryKey: ['bank-accounts', companyId],
    queryFn: () => getBankAccountsForCompany(companyId),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 6,
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });
};

export const useUpdateBankAccounts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, data }: { companyId: string; data: any[] }) =>
      updateBankAccounts(companyId, data),
    onSuccess: (_, variables) => {
      invalidateBankAccounts(queryClient, variables.companyId);
      toast.success('Bank account(s) updated successfully');
    },
    onError: () => {
      toast.error('Failed to update bank accounts');
    },
  });
};
