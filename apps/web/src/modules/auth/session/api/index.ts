import api from '@/lib/axios';
import { isAxiosError } from 'axios';
import type { ApiResponse } from '@/shared/types/core';
import type { AuthUserContext } from '../model/types';
import { authStore } from '../model/store';
import { setLogoutReason } from '../../credentials';

export const handleLogout = async () => {
  await api.post('/auth/logout').catch(() => {});
};

/**
 * When the page refreshes or user visits a new tab, memory is wiped — Zustand store is reset
 * Cookies are still set but we lose csrfToken and user data
 * So we need to verify the current session and get user data and token from the backend
 *
 * This is because we're storing csrfToken in store and not local or session storage for security reasons
 */
export const fetchSession = async (): Promise<
  ApiResponse<{ user: AuthUserContext; csrfToken: string }>
> => {
  try {
    const res = await api.get('/auth/me');
    if (!res.data.success) throw new Error('Session invalid or expired');

    if (res.data.success) {
      authStore.getState().setAuth(res.data.data.user, res.data.data.csrfToken);
    }

    return res.data;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 401) {
      const wasAuthenticated =
        localStorage.getItem('wasAuthenticated') === 'true';
      if (wasAuthenticated) {
        setLogoutReason('expired');
      }
      throw new Error('Unauthorized'); // triggers useQuery failure state
    }
    throw err;
  }
};

export const refreshToken = async (): Promise<
  ApiResponse<{ csrfToken: string }>
> => {
  try {
    const res = await api.post('/auth/refresh');
    return res.data as ApiResponse<{ csrfToken: string }>;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};
