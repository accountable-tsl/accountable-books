import { useLocation } from "react-router-dom";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { routes as oldRoutes } from "../routes/routes";
import { useEffect } from "react";
import { companyStore } from "@/domains/company/store";
import { RouteMeta } from "../routes/types";
import { routes } from "@/shared/routes/routes";

export type BreadcrumbItem = {
  label: string;
  link?: string;
};

interface PageStore {
  currentPage: string;
  description?: string;
  customMeta?: Record<string, any>;
  accessDenied?: boolean;
  sidebarCollapsed?: boolean;

  setPageInfo: (options: Partial<Omit<PageStore, "setPageInfo">>) => void;
  clearPageInfo: () => void;
}

export const pageStore = create<PageStore>()(
  immer((set) => ({
    currentPage: "",
    description: "",
    customMeta: {},
    accessDenied: false,
    sidebarCollapsed: false,

    setPageInfo: (options) =>
      set((state) => {
        Object.assign(state, options);
      }),

    clearPageInfo: () =>
      set(() => ({
        currentPage: "",
        description: "",
        customMeta: {},
        accessDenied: false,
        sidebarCollapsed: false,
      })),
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

/**
 * Hook that watches the URL and updates the page store
 * with current page info (title, description, sidebar state, custom meta).
 */

export function useUpdatePageInfo() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;

    // Try to match the current URL against your routes
    const matchedRoute = Object.values(routes).find((route) => {
      // Convert the staticPath into a regex for matching
      const pattern = route.staticPath.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(path);
    });

    // Use the route firmsOnly to block access to firmOnly pages for non-firm users

    if (matchedRoute) {
      const meta = matchedRoute.meta;
      pageStore.getState().setPageInfo({
        currentPage: meta?.label || "",
        description: meta?.description || "",
        sidebarCollapsed: meta?.sidebarCollapsed || false,
      });
    } else {
      pageStore.getState().setPageInfo({
        currentPage: "",
        description: "",
        sidebarCollapsed: false,
      });
    }
  }, [location.pathname]);
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
