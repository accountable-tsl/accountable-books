import { useCompany } from "@/domains/company/store";
import { routes } from "@/shared/routes/routes-old";
import { Navigate } from "react-router-dom";

export default function DashboardRedirect() {
  const { companyId } = useCompany();

  if (!companyId) {
    return <Navigate to={routes.login.staticPath} replace />;
  }

  return <Navigate to={routes.dashboard.buildPath({ companyId })} replace />;
}
