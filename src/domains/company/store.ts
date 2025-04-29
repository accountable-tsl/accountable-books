import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CompanyStore } from "./types";
import { getCompanyDetails } from "./api";

export const companyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      companyId: null,
      companyType: null,
      slug: null,
      company: null,
      isLoading: false,
      error: null,

      // Set the active company and fetch its data
      fetchCompany: async (companyId) => {
        set({ companyId, isLoading: true, error: null });

        try {
          const res = await getCompanyDetails(companyId);
          if (res.success && res.data) {
            set({
              company: res.data,
              companyId: res.data.id,
              companyType: res.data.companyType,
              slug: res.data.assignedFirmSlug || null,
              isLoading: false,
              error: null,
            });
          } else {
            set({ error: "Failed to fetch company", isLoading: false });
          }
        } catch (error) {
          set({ error: "Error fetching company", isLoading: false });
        }
      },

      setCompany: (company) => {
        set({
          company,
          companyId: company.id,
          companyType: company.companyType,
          slug: company.assignedFirmSlug,
          isLoading: false,
          error: null,
        });
      },

      // Clear out company state (e.g. on logout)
      clearCompany: () => {
        set({
          companyId: null,
          slug: null,
          company: null,
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: "company-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ companyId: state.companyId, slug: state.slug }),
    }
  )
);

export const useCompany = () => {
  const {
    company,
    companyId,
    companyType,
    slug,
    isLoading,
    error,
    setCompany,
    fetchCompany,
    clearCompany,
  } = companyStore((s) => s);

  return {
    company,
    companyId,
    companyType,
    slug,
    isLoading,
    error,
    setCompany,
    fetchCompany,
    clearCompany,
  };
};
