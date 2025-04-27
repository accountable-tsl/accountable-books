import { CompanyData } from "@/types/types";

type CompanyStore = {
    companyId: string | null;
    company: CompanyData | null;
    isLoading: boolean;
    error: string | null;
    setCompanyId: (id: string) => void;
    fetchCompanyDetails: (id: string) => Promise<void>;
  };