import { getAccountMeta } from '@/domains-pending-migration/account-classification/api';
import { useQuery } from '@tanstack/react-query';

export const useAccountMeta = () => {
  return useQuery({
    queryKey: ['accountClassificationMetadata'],
    queryFn: getAccountMeta,
    staleTime: 1000 * 60 * 60 * 12, // 12 hours
    gcTime: 1000 * 60 * 60 * 24 * 2, // 2 days
  });
};

// TODO: Remember to invalidate on mutations
export const useAccountTypeByKey = () => {
  const { data } = useAccountMeta();
  return new Map(data?.enrichedAccountTypes.map((item) => [item.key, item]));
};

export const useAccountElementByKey = () => {
  const { data } = useAccountMeta();
  return new Map(data?.accountElements.map((item) => [item.key, item]));
};

export const useParentElementByKey = () => {
  const { data } = useAccountMeta();
  return new Map(data?.parentAccountElements.map((item) => [item.key, item]));
};
