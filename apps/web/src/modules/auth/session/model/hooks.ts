import { QueryClient, useQuery } from '@tanstack/react-query';
import { fetchSession } from '../api';
import { authStore } from './store';
import { setLogoutReason } from '../../credentials';

const queryClient = new QueryClient();
export const clearSessionFn = (
  logoutReason?: 'expired' | 'manual' | 'forced',
) => {
  authStore.getState().clearAuth();

  const theme = localStorage.getItem('theme');

  localStorage.clear();

  if (theme) {
    localStorage.setItem('theme', theme);
  }

  if (logoutReason) {
    setLogoutReason(logoutReason);
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
