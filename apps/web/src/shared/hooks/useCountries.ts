import { getCountries } from '@/shared/services/countryServices';
import { useQuery } from '@tanstack/react-query';

export const useCountries = () => {
  return useQuery({
    queryKey: ['countries'],
    queryFn: getCountries,
    staleTime: 1000 * 60 * 60 * 4,
    gcTime: 1000 * 60 * 60 * 24,
  });
};
