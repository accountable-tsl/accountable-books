import { useQuery } from "@tanstack/react-query";
import { getCompanyDetails } from "@/domains/company/api";
import { useAuth, useSessionLoader } from "@/features/auth/hooks";

export const useCompanyDetails = (companyId: string) => {
  const { isLoggedIn } = useAuth();
  const { loading: sessionLoading } = useSessionLoader();

  return useQuery({
    queryKey: ["companyDetails", companyId],
    queryFn: () => getCompanyDetails(companyId),
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
    enabled: !!companyId && isLoggedIn && !sessionLoading,
  });
};
