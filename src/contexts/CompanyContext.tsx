import { createContext, ReactNode, useContext, useState } from "react";

type CompanyProviderProps = {
  children: ReactNode;
};

type CompanyContextType = {
  companyId: any;
  setCompanyId: any;
};

export const CompanyContext = createContext<CompanyContextType | null>(null);

export const CompanyProvider = ({ children }: CompanyProviderProps) => {
  const [companyId, setCompanyId] = useState(null);

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
};
