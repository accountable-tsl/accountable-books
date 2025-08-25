import { fetchSession } from '@/features/auth/api';
import { authStore } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

export const clearSessionFn = (logoutReason?: 'expired' | 'manual' | 'forced') => {
  authStore.getState().clearAuth();

  const theme = localStorage.getItem('theme');

  localStorage.clear();

  if (theme) {
    localStorage.setItem('theme', theme);
  }

  if (logoutReason) {
    localStorage.setItem('logoutReason', logoutReason);
  }

  queryClient.clear();
};

export const useSessionQuery = () => {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchSession, // returns { user, csrfToken }
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
};
