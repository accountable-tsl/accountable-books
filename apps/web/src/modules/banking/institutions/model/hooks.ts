import {
  fetchBanksByCountryCode,
  fetchBanksByCountryId,
} from '@/modules/banking/institutions/api';
import { useQuery } from '@tanstack/react-query';
import { type BankQueryType } from '@/modules/banking/institutions/model/types';

export const useBanks = (type: BankQueryType, value?: string) => {
  const fetchFn = () => {
    if (!value) throw new Error('No value provided for bank query');

    switch (type) {
      case 'countryId':
        return fetchBanksByCountryId(value);
      case 'countryCode':
        return fetchBanksByCountryCode(value);
      //   case "id":
      //     return fetchBankById(value);
      //   case "key":
      //     return fetchBankByKey(value);
      default:
        throw new Error('Unsupported query type');
    }
  };

  return useQuery({
    queryKey: ['banks', type, value],
    queryFn: fetchFn,
    enabled: !!value,
    staleTime: 1000 * 60 * 60 * 4,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
};
