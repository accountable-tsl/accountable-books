import { createContext, ReactNode, useContext, useState } from "react";

type CompanyProviderProps = {
  children: ReactNode;
  initialCompanyId?: string | number;
};

type CompanyContextType = {
  companyId: string | number | null;
  setCompanyId: (id: string | number) => void;
};

export const CompanyContext = createContext<CompanyContextType | null>(null);

export const CompanyProvider = ({
  children,
  initialCompanyId = "",
}: CompanyProviderProps) => {
  const [companyId, setCompanyId] = useState<string | number | null>(
    initialCompanyId
  );

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
};
