import { useCompany } from "@/hooks/useCompany";
import { Navigate } from "react-router-dom";

export default function DashboardRedirect() {
  const { companyId } = useCompany();

  if (!companyId) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/${companyId}`} replace />;
}
