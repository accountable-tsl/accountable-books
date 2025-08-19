import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CompanyStore } from './types';
import { getCompanyDetails } from './api';

export const companyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      companyId: null,
      companyType: undefined,
      slug: null,
      company: null,
      isLoading: false,
      error: null,
      onboardingStatus: null,

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
              onboardingStatus: res.data.onboardingState?.steps
                ? 'onboarding_complete'
                : 'not_started',
              isLoading: false,
              error: null,
            });
          } else {
            set({ error: 'Failed to fetch company', isLoading: false });
          }
        } catch (error) {
          set({ error: 'Error fetching company', isLoading: false });
        }
      },

      setCompany: (companyOrUpdater) =>
        set((state) => {
          const company =
            typeof companyOrUpdater === 'function'
              ? companyOrUpdater(state.company)
              : companyOrUpdater;

          if (!company) return state; // ignore null

          return {
            ...state,
            company,
            companyId: company.id,
            companyType: company.companyType,
            slug: company.assignedFirmSlug ?? null,
            onboardingStatus: company.onboardingState?.steps
              ? 'onboarding_complete'
              : 'not_started',
            isLoading: false,
            error: null,
          };
        }),

      setOnboardingStatus: (status) =>
        set((state) => ({
          onboardingStatus: status,
          company: state.company ? { ...state.company, onboardingStatus: status } : state.company,
        })),

      // Clear out company state (e.g. on logout)
      clearCompany: () => {
        set({
          companyId: null,
          slug: null,
          company: null,
          isLoading: false,
          error: null,
          onboardingStatus: null,
        });
      },
    }),
    {
      name: 'company-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        companyId: state.companyId,
        slug: state.slug,
        onboardingStatus: state.onboardingStatus,
      }),
    },
  ),
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
    setOnboardingStatus,
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
    setOnboardingStatus,
    fetchCompany,
    clearCompany,
  };
};
