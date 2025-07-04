import { matchPath, useLocation } from "react-router-dom";
import { flatRoutes, matchRouteForPath } from "@/shared/routes/utils";
import { useSession } from "@/features/auth/Session";

export function useBreadcrumbs() {
  const location = useLocation();
  const { user } = useSession();
  const companyId = user?.currentCompanyId;
  const pathname = location.pathname;

  const matchedEntry = Object.entries(flatRoutes).find(([_, route]) =>
    matchPath({ path: route.staticPath, end: true }, pathname)
  );

  if (!matchedEntry) return [];

  const [matchedKey, matchedRoute] = matchedEntry;

  // Decompose route key hierarchy
  const parts = matchedKey.split(".");

  const breadcrumbKeys = parts.reduce<string[]>((acc, _, index) => {
    acc.push(parts.slice(0, index + 1).join("."));
    return acc;
  }, []);

  const breadcrumbs = breadcrumbKeys
    .map((key) => {
      const route = flatRoutes[key];
      if (!route || route.meta?.hideInBreadcrumb) return null;

      const label = route.meta?.label;
      const link = route.build
        ? route.build({ companyId }) // assumes companyId is required
        : "#"; // route.staticPath.replace(":companyId", companyId);

      return { label, link };
    })
    .filter(Boolean) as { label: string; link: string }[];

  return breadcrumbs;
}
