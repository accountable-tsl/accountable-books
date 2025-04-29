import { useLocation } from "react-router-dom";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { RouteMeta, routes } from "../routes";
import { useEffect } from "react";

export type BreadcrumbItem = {
  label: string;
  link?: string;
};

interface PageStore extends RouteMeta {
  currentPage: string;
  breadcrumbs: BreadcrumbItem[];
  accessDenied?: boolean;
  customMeta?: Record<string, any>;
  setPageInfo: (
    currentPage: string,
    breadcrumbs?: BreadcrumbItem[],
    options?: Partial<
      Omit<PageStore, "currentPage" | "breadcrumbs" | "setPageInfo">
    >
  ) => void;
}

export const pageStore = create<PageStore>()(
  immer((set) => ({
    currentPage: getDefaultPageName(),
    breadcrumbs: [],

    setPageInfo: (currentPage, breadcrumbs = [], options = {}) =>
      set((state) => {
        state.currentPage = currentPage || getDefaultPageName();
        state.breadcrumbs = breadcrumbs.length ? breadcrumbs.slice(0, 2) : [];
        Object.assign(state, options);
      }),
  }))
);

function getDefaultPageName(): string {
  const path = window.location.pathname.split("/").filter(Boolean).pop();
  return path
    ? path.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : "Home";
}

// Flatten routes object into a simple list for matching
const flatRoutes: { path: string; meta: RouteMeta }[] = [];
function flatten(obj: any) {
  for (const key in obj) {
    if (obj[key]?.staticPath && obj[key]?.meta?.label) {
      flatRoutes.push({
        path: obj[key].staticPath,
        meta: obj[key].meta,
      });
    } else if (typeof obj[key] === "object") {
      flatten(obj[key]);
    }
  }
}

flatten(routes);

export function useUpdatePageInfo() {
  const location = useLocation();
  const setPageInfo = pageStore((state) => state.setPageInfo);

  useEffect(() => {
    const path = location.pathname;

    const match = flatRoutes.find((r) => {
      const routeParts = r.path.split("/:companyId")[1] || "";
      return path.includes(routeParts);
    });

    if (match) {
      const meta = match.meta;
      setPageInfo(
        meta.label || "accountable",
        [
          { label: "Home", link: "/" },
          { label: meta.label || "accountable", link: location.pathname },
        ],
        {
          description: meta.description,
          pageIcon: meta.pageIcon,
          accessDenied: meta.role ? false : undefined,
          sidebarCollapsed: meta.sidebarCollapsed ?? false,
          customMeta: {
            role: meta.role,
            firmsOnly: meta.firmsOnly,
          },
        }
      );
    } else {
      setPageInfo("Page Not Found", [{ label: "Home", link: "/" }]);
    }
  }, [location.pathname, setPageInfo]);
}

export function usePageMeta(suffix = "Accountable") {
  const { currentPage, description } = pageStore();

  useEffect(() => {
    document.title = currentPage ? `${currentPage} | ${suffix}` : suffix;

    if (description) {
      let meta = document.querySelector("meta[name='description']");
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", description);
    }
  }, [currentPage, suffix, description]);
}
