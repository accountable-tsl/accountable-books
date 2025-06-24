import { useAuth } from "@/features/auth/hooks";
import { useLocation } from "react-router-dom";
import { routes } from "@/shared/routes/routes";

export function useBreadcrumbs() {
  const location = useLocation();
  const { user } = useAuth();
  if (!user) throw new Error("No user context");
  const companyId = user?.currentCompanyId;

  const path = location.pathname; // e.g. "/abc123/invoices/9876"

  // Split path into segments // ["abc123", "invoices", "9876"]
  const segments = path.split("/").filter(Boolean);

  const breadcrumbs: { label: string; link: string }[] = [];
  let pathSoFar = "";

  /**  We loop through each segment...
   * and build up /abc123, /abc123/invoices and /abc123/invoices/9876
   * At each stage, we try to find a matching route
   * */
  for (let i = 0; i < segments.length; i++) {
    pathSoFar += `/${segments[i]}`;

    // Find route that matches this part
    const matchedRoute = Object.values(routes).find((route) => {
      const pattern = route.staticPath.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(pathSoFar);
    });

    if (
      matchedRoute &&
      matchedRoute.meta?.label &&
      !matchedRoute.meta.hideInBreadcrumb
    ) {
      const label = matchedRoute.meta.label;
      const link = matchedRoute.path ? matchedRoute.path(companyId) : pathSoFar;

      breadcrumbs.push({ label, link });
    }
  }

  return breadcrumbs;
}
