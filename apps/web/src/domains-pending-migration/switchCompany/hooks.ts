import { useNavigate } from 'react-router';
import type { SwitchCompanyOpts } from '@/domains-pending-migration/switchCompany/types';
import { useCompany } from '@/domains-pending-migration/company/store';
import { useRef } from 'react';
import { toast } from 'sonner';
import { switchCompanyApi } from './api';
import { authStore } from '../auth/store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/Session';

export function useCompanySwitch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // const { user } = authStore((s) => s);
  const { setAuth, user, refetchSession, refetchCompany } = useSession();
  const { companyId: currentCompanyId, slug: currentSlug } = useCompany();

  const originalCompanyRef = useRef<{
    companyId: string | null;
    slug: string | null;
  }>({ companyId: null, slug: null });

  const LOCALSTORAGE_KEY = 'original-company-for-demo';

  function setOriginalCompany(companyId: string, slug: string) {
    originalCompanyRef.current = { companyId, slug };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ companyId, slug }));
  }

  function getOriginalCompany() {
    // Prefer in-memory, fallback to localStorage
    return originalCompanyRef.current.companyId
      ? originalCompanyRef.current
      : JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || 'null');
  }

  function clearOriginalCompany() {
    originalCompanyRef.current = { companyId: null, slug: null };
    localStorage.removeItem(LOCALSTORAGE_KEY);
  }

  const switchMutation = useMutation({
    mutationFn: async (companyId: string) => {
      // Pre-validate user has access to target company
      if (!user?.companies?.some((company) => company.id === companyId)) {
        throw new Error('You do not have access to this company');
      }

      const res = await switchCompanyApi(companyId);

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Switch failed');
      }

      return res.data;
    },
    onSuccess: (data) => {
      const { user, csrfToken } = data;

      // Update auth store with new user context (includes company data)
      if (setAuth) {
        setAuth(user, csrfToken);
      } else {
        authStore.getState().setAuth(user, csrfToken);
      }

      // Invalidate all queries
      // There's an issue here, because this then might affect other users that are not switching
      // queryClient.invalidateQueries();
      refetchSession();
      refetchCompany();

      // Navigate to new company dashboard
      navigate(`/${user.currentCompanyId}/dashboard`, {
        replace: true,
      });

      toast.success(
        `Switched to ${user.currentCompany.displayName || user.currentCompany.legalName}`,
      );
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(errorMessage);
    },
  });

  const switchCompany = async ({
    fromCompanyId,
    toCompanyId,
    onError,
    onSuccess,
    rememberCurrentAsOriginal, // Pass true when switching to demo
  }: SwitchCompanyOpts) => {
    if (fromCompanyId === toCompanyId) {
      toast.info('You are already on this company');
      return;
    }

    // Prevent concurrent switches
    if (switchMutation.isPending) {
      toast.info('Company switch already in progress');
      return;
    }

    try {
      if (rememberCurrentAsOriginal && currentCompanyId) {
        setOriginalCompany(currentCompanyId, currentSlug || 'app');
      }

      // Show loading toast with dismissible ID
      const loadingToast = toast.loading('Switching company...');

      // Verify that the user has access to the target company
      if (!user?.companies?.some((company) => company.id === toCompanyId)) {
        toast.error('You do not have access to this company');
        return;
      }

      try {
        await switchMutation.mutateAsync(toCompanyId);

        toast.dismiss(loadingToast); // Dismiss loading toast on success
        onSuccess?.();
      } catch (mutationError) {
        toast.dismiss(loadingToast); // Dismiss loading toast on error
        throw mutationError; // Re-throw to be caught by outer catch
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onError?.(errorMessage);
    }
  };

  const handleExitDemo = async ({
    onError,
    onSuccess,
  }: {
    onError?: (err: unknown) => void;
    onSuccess?: () => void;
  } = {}) => {
    const { companyId, slug } = getOriginalCompany() || {};
    if (companyId && slug) {
      await switchCompany({ toCompanyId: companyId, onError, onSuccess });
      clearOriginalCompany();
    } else {
      const msg = 'Original company not found in this session.';
      toast.error(msg);
      onError?.(msg);
    }
  };

  return {
    switchCompany,
    handleExitDemo,
    isSwitching: switchMutation.isPending,
    // isCurrentCompanyDemo,
    // isCurrentCompanyDemoByFlag,
  };
}
