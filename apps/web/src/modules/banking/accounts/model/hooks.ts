import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBankAccountsForCompany,
  getMinimalBankAccountDetails,
  updateBankAccounts,
} from '../api';
import type { UpdateBankAccount } from './types';

// Reusable invalidation function
export const invalidateBankAccounts = (queryClient: any, companyId: string) => {
  queryClient.invalidateQueries({ queryKey: ['bank-accounts', companyId] });
};

const generateBankAccountKey = ({ companyId, suffix }: { companyId: string; suffix?: string }) => [
  'bank-accounts',
  companyId,
  ...(suffix ? [suffix] : []),
];

// use query to fetch bank accounts
export const useCompanyBankAccounts = (companyId: string) => {
  return useQuery({
    queryKey: generateBankAccountKey({ companyId }),
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
    mutationFn: ({ companyId, data }: { companyId: string; data: UpdateBankAccount[] }) =>
      updateBankAccounts(companyId, data),
    onSuccess: (_, variables) => {
      invalidateBankAccounts(queryClient, variables.companyId);
    },
  });
};

export const useMinimalBankAccountDetails = (companyId: string, bankAccountIds?: string[]) => {
  return useQuery({
    queryKey: generateBankAccountKey({ companyId, suffix: 'simple' }),
    queryFn: () => getMinimalBankAccountDetails({ companyId, bankAccountIds }),
  });
};
