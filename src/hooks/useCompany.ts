import { companyStore } from "@/domains/company/store";

export const useCompany = () => {
  const {
    company,
    companyId,
    slug,
    isLoading,
    error,
    setCompany,
    fetchCompany,
    clearCompany,
  } = companyStore((s) => s);

  return {
    company,
    companyId,
    slug,
    isLoading,
    error,
    setCompany,
    fetchCompany,
    clearCompany,
  };
};
