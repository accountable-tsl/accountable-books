import { useQuery } from "@tanstack/react-query";
import { getAccountMeta } from "@/domains/account-classification/api";

export const useAccountMeta = () => {
  return useQuery({
    queryKey: ["accountClassificationMetadata"],
    queryFn: getAccountMeta,
    // staleTime: 1000 * 60 * 60 * 24, // 24 hours
    // gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
};

// TODO: Remember to invalidate on mutations
