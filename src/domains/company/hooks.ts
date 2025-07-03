import { useQuery } from "@tanstack/react-query";
import { getCompanyDetails } from "@/domains/company/api";
import { useAuth } from "@/features/auth/hooks";
import { useSession } from "@/features/auth/SessionProvider";
import { useMemo } from "react";

export const useCompanyDetails = (companyId: string) => {
  const { isLoggedIn } = useAuth();
  const { loading: sessionLoading } = useSession();

  return useQuery({
    queryKey: ["companyDetails", companyId],
    queryFn: () => getCompanyDetails(companyId),
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
    enabled: !!companyId && isLoggedIn && !sessionLoading,
  });
};

export const useCurrentCompany = () => {
  const { isLoggedIn, currentCompanyId, user, logout } = useAuth();
  const { loading: sessionLoading, refetch: refetchSession } = useSession();
  const {
    data: companyDataResponse,
    isLoading,
    error: companyError,
    refetch: refetchCompany,
  } = useCompanyDetails(currentCompanyId || "");

  const { currentCompanyId: _, currentCompany, ...rest } = user || {};
  const companyData = companyDataResponse?.data;
  const companyType = companyData?.companyType;

  const hasAppAccess = currentCompany
    ? currentCompany.onboarding.canAccessApp
    : false;

  const returnObj = useMemo(
    () => ({
      isLoggedIn,
      sessionLoading,
      companyLoading: isLoading,
      isLoading: isLoading || sessionLoading,

      user: rest,
      onboarding: currentCompany?.onboarding,
      hasAppAccess,

      company: companyData,
      companyId: currentCompanyId,
      companyType,
      companyError,

      refetchCompany,
      refetchSession,

      logout,
    }),
    [
      isLoggedIn,
      sessionLoading,
      user,
      companyData,
      companyError,
      refetchCompany,
      refetchSession,
      logout,
    ]
  );

  return returnObj;
};
