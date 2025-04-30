import { useCompany } from "@/domains/company/store";
import { routes } from "@/shared/routes/routes";
import { Navigate } from "react-router-dom";

export default function DashboardRedirect() {
  const { companyId } = useCompany();

  if (!companyId) {
    return <Navigate to={routes.login.staticPath} replace />;
  }

  console.log("Redirecting to dashboard with companyId:", companyId);
  return <Navigate to={routes.dashboard.buildPath({ companyId })} replace />;
}
