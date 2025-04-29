import { useCompany } from "@/domains/company/store";
import { Navigate } from "react-router-dom";

export default function DashboardRedirect() {
  const { companyId } = useCompany();

  if (!companyId) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/${companyId}`} replace />;
}
