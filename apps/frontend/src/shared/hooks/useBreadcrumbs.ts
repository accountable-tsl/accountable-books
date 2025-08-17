import { useLocation } from "react-router-dom";
import {
  findMatchingRouteSmart,
  flatRoutes,
  routeIndex,
} from "@/shared/routes/utils";
import { useSession } from "@/features/auth/Session";

export function useBreadcrumbs() {
  const location = useLocation();
  const { user } = useSession();
  const companyId = user?.currentCompanyId;
  const pathname = location.pathname;

  const matchedEntry = findMatchingRouteSmart(routeIndex, pathname);
  if (!matchedEntry) return [];

  const { key: matchedKey } = matchedEntry;

  const parts = matchedKey.split(".");
  const breadcrumbKeys = parts.reduce<string[]>((acc, _, index) => {
    acc.push(parts.slice(0, index + 1).join("."));
    return acc;
  }, []);

  const HOME_KEY = "general.home";
  if (!breadcrumbKeys.includes(HOME_KEY)) {
    breadcrumbKeys.unshift(HOME_KEY);
  }

  const rawBreadcrumbs = breadcrumbKeys
    .map((key) => {
      const route = flatRoutes[key];
      if (!route || route.meta?.hideInBreadcrumb) return null;

      const label = route.meta?.label;
      const link = route.build ? route.build({ companyId }) : "#";

      return { label, link };
    })
    .filter(Boolean) as { label: string; link: string }[];

  const seen = new Set<string>();
  const breadcrumbs = rawBreadcrumbs.filter((item) => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  });

  return breadcrumbs;
}
