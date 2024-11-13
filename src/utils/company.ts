import { useContext, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CompanyContext } from "../contexts/CompanyContext";

export const useCompany = () => {
  const { id } = useParams();
  const context = useContext(CompanyContext);

  if (context === null) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }

  const { setCompanyId } = context;

  useEffect(() => {
    if (id) {
      setCompanyId(id);
    }
  }, [id, setCompanyId]);

  return context;
};
