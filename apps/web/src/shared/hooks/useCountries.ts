import { useQuery } from '@tanstack/react-query';

import { getCountries } from '@/shared/services/countryServices';

export const useCountries = () => {
  return useQuery({
    queryKey: ['countries'],
    queryFn: getCountries,
    staleTime: 1000 * 60 * 60 * 4,
    gcTime: 1000 * 60 * 60 * 24,
  });
};
