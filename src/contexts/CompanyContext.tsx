import { createContext, ReactNode, useState } from "react";

type CompanyProviderProps = {
  children: ReactNode;
  initialCompanyId?: string;
};

type CompanyContextType = {
  companyId: string | null;
  setCompanyId: (id: string) => void;
};

export const CompanyContext = createContext<CompanyContextType | null>(null);

export const CompanyProvider = ({
  children,
  initialCompanyId = "",
}: CompanyProviderProps) => {
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
};
