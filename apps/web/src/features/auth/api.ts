import type { AuthUserContext, LoginForm } from './types';
import api from '@/lib/axios';
import { isAxiosError } from 'axios';
import type { ApiResponse } from '@/shared/types/core';
import { authStore } from './store';
// Import OpenAPI-generated types for response validation
import type { components } from '../../../../../packages/api-types/src/generated/openapi-paths';
import { schemas } from '@accountable-books/api-types/zod';

export const handleLogin = async (
  data: LoginForm,
): Promise<ApiResponse<{ user: AuthUserContext; csrfToken: string }>> => {
  try {
    const resp = await api.post('/auth/login', data);

    // Validate response against OpenAPI schema
    const validatedResponse = schemas.LoginResponse.parse(resp.data);

    return validatedResponse as ApiResponse<{
      user: AuthUserContext;
      csrfToken: string;
    }>;
  } catch (err: any) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};

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

    // Validate response against OpenAPI schema
    const validatedResponse = schemas.MeResponse.parse(res.data);

    if (validatedResponse.success && validatedResponse.data && validatedResponse.data.csrfToken) {
      // Type assertion to handle compatibility between OpenAPI and internal types
      authStore
        .getState()
        .setAuth(validatedResponse.data.user as any, validatedResponse.data.csrfToken);
    }

    return validatedResponse as any;
  } catch (err: any) {
    if (err.response?.status === 401) {
      const wasAuthenticated = localStorage.getItem('wasAuthenticated') === 'true';
      wasAuthenticated && localStorage.setItem('logoutReason', 'expired');
      throw new Error('Unauthorized'); // triggers useQuery failure state
    }
    throw err;
  }
};
// export const fetchSession = async (): Promise<
//   ApiResponse<{ user: AuthUserContext; csrfToken: string }>
// > => {
//   try {
//     const res = await api.get("/auth/me");
//     return res.data as ApiResponse<{
//       user: AuthUserContext;
//       csrfToken: string;
//     }>;
//   } catch (err: unknown) {
//     if (isAxiosError(err) && err.response?.data) {
//       return err.response.data;
//     }

//     return { success: false, message: "An unexpected error occurred" };
//   }
// };

export const refreshToken = async (): Promise<ApiResponse<{ csrfToken: string }>> => {
  try {
    const res = await api.post('/auth/refresh');

    // Validate response against OpenAPI schema
    const validatedResponse = schemas.RefreshResponse.parse(res.data);

    return validatedResponse as ApiResponse<{ csrfToken: string }>;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }

    return { success: false, message: 'An unexpected error occurred' };
  }
};
