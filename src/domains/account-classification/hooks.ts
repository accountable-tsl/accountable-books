import { useQuery } from "@tanstack/react-query";
import { getAccountClassificationMetadata } from "@/domains/account-classification/api";

export const useAccountClassificationMetadata = () => {
  return useQuery({
    queryKey: ["accountClassificationMetadata"],
    queryFn: getAccountClassificationMetadata,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
};

// TODO: Remember to invalidate on mutations