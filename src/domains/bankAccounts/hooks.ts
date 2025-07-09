import { useQuery } from "@tanstack/react-query";
import { getBankAccountsForCompany } from "@/domains/bankAccounts/api";

// use query to fetch bank accounts
export const useCompanyBankAccounts = (companyId: string) => {
  return useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: () => getBankAccountsForCompany(companyId),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 6,
    enabled: !!companyId,
    refetchOnWindowFocus: false,
  });
};
