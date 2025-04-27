import { useContext, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CompanyContext } from "../contexts/CompanyContext";

export const useCompany = () => {
  const { id } = useParams();
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }

  const { setCompanyId } = context;

  useEffect(() => {
    if (id) {
      setCompanyId(id);
      setGlobalCompanyId(id);
    }
  }, [id, setCompanyId]);

  return context;
};

let companyId: string | null = null;

export function setGlobalCompanyId(id: string) {
  companyId = id;
}

export function getGlobalCompanyId() {
  return companyId;
}
