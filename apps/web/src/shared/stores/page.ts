import { useEffect } from 'react';
import { findMatchingRouteSmart, routeIndex } from '@/shared/routes/utils';
import { useLocation } from 'react-router';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

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
  setSidebarCollapsed?: (collapsed: boolean) => void;

  setPageInfo: (options: Partial<Omit<PageStore, 'setPageInfo'>>) => void;
  clearPageInfo: () => void;
}

export const pageStore = create<PageStore>()(
  immer((set) => ({
    currentPage: '',
    description: '',
    customMeta: {},
    accessDenied: false,
    sidebarCollapsed: undefined,

    setSidebarCollapsed: (collapsed) =>
      set((state) => {
        state.sidebarCollapsed = collapsed;
      }),

    setPageInfo: (options) =>
      set((state) => {
        Object.assign(state, options);
      }),

    clearPageInfo: () =>
      set(() => ({
        currentPage: '',
        description: '',
        customMeta: {},
        accessDenied: false,
        sidebarCollapsed: false,
      })),
  })),
);

function getDefaultPageName(): string {
  const path = window.location.pathname.split('/').filter(Boolean).pop();
  return path
    ? path.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : 'Home';
}

/**
 * Hook that watches the URL and updates the page store
 * with current page info (title, description, sidebar state, custom meta).
 */

export function useUpdatePageInfo() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const matchedEntry = findMatchingRouteSmart(routeIndex, path);

    if (matchedEntry) {
      const meta = matchedEntry.route.meta;

      pageStore.getState().setPageInfo({
        currentPage: meta?.label || '',
        description: meta?.description || '',
        sidebarCollapsed: meta?.sidebarCollapsed || false,
      });
    } else {
      pageStore.getState().setPageInfo({
        currentPage: '',
        description: '',
        sidebarCollapsed: false,
      });
    }
  }, [location.pathname]);
}

export function usePageMeta(suffix = 'Accountable') {
  const { currentPage, description } = pageStore();

  useEffect(() => {
    document.title = currentPage ? `${currentPage} | ${suffix}` : suffix;

    if (description) {
      let meta = document.querySelector("meta[name='description']");
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', description);
    }
  }, [currentPage, suffix, description]);
}
