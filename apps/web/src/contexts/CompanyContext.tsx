import type { CompanyData } from '@/domains-pending-migration/company/types';
import type { ReactNode } from 'react';
import { createContext, useEffect, useState } from 'react';
import { getCompanyDetails as fetchCompany } from '@/domains-pending-migration/company/api';

type CompanyProviderProps = {
  children: ReactNode;
  initialCompanyId?: string;
};

type CompanyContextType = {
  companyId: string | null;
  company: CompanyData | null;
  setCompanyId: (id: string) => void;
  isLoading: boolean;
  error: string | null;
};

export const CompanyContext = createContext<CompanyContextType | null>(null);

export const CompanyProvider = ({
  children,
  initialCompanyId = 'default',
}: CompanyProviderProps) => {
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  const [company, setCompany] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();
    const fetchCompanyDetails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchCompany(companyId);
        if (result.success) {
          setCompany(result.data);
        } else {
          setError('Failed to fetch company details');
        }
      } catch (err) {
        setError('Error fetching company details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanyDetails();
    return () => controller.abort();
  }, [companyId]);

  return (
    <CompanyContext.Provider
      value={{ companyId, company, setCompanyId, isLoading, error }}
    >
      {children}
    </CompanyContext.Provider>
  );
};
