import type { AxiosError, AxiosRequestConfig } from 'axios';
import { authStore, refreshToken } from '@/modules/auth';
import { isPublicRoute } from '@/shared/routes';
import axios from 'axios';

import { getSessionCorrelationId } from './session-correlation';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  withCredentials: true,
});

// Auto-attach CSRF token and session correlation ID to requests
api.interceptors.request.use((config) => {
  const csrfToken = authStore.getState().csrfToken;

  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }

  config.headers['X-Correlation-Id'] = getSessionCorrelationId();

  return config;
});

/**
 * When the access token expires (which is normal because it is short-lived for security),
 * API calls will start returning a 401 Unauthorized error.
 *
 * Without handling this, the user will see failed actions or error messages,
 * and the app may appear stuck, even though their session could still be recoverable
 * using the refresh token.
 *
 * In a bit, they are redirected to login page, which is a frustating UX
 *
 * Instead of redirecting to login page,
 * We can catch all these 401 errors
 * and create a queue for these failed requests
 *
 * First, Attempt to refresh the access token silently using the refresh token (stored in a secure cookie).
 * Then, we retry all the API calls that failed during this time
 * If the refresh fails, we clear the queue and redirect to login (coz session is truly expired)
 */

// Response interceptor for silent refresh

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error: unknown) => void;
  config: AxiosRequestConfig;
}> = [];

/**
 * Process queued requests: either retry them after refresh succeeds,
 * or reject them if refresh fails.
 */
const processQueue = (error: unknown, tokenRefreshed: boolean) => {
  failedQueue.forEach(({ resolve, reject, config }) => {
    if (tokenRefreshed) {
      // Retry the original request
      resolve(api(config));
    } else {
      reject(error);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config;

    // If it's not a 401 error or we don't have the original request, just reject
    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest.url?.includes('/auth')
    ) {
      return Promise.reject(error);
    }

    // Prevent infinite loop by not retrying refresh or login endpoints
    if (
      originalRequest.url &&
      isPublicRoute(originalRequest.url)
      // || originalRequest.url?.includes("/auth")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // If refresh is already happening, queue the request
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    isRefreshing = true;

    try {
      // Attempt to refresh token... should ideally return new csrf
      const refreshResp = await refreshToken();
      if (!refreshResp.success || !refreshResp.data) {
        throw new Error(refreshResp.message);
      }

      // Update csrf token if available
      const { csrfToken: newCsrfToken } = refreshResp.data;
      if (newCsrfToken) {
        authStore.getState().setCsrf(newCsrfToken);
      }

      // Process queue: retry all failed requests
      processQueue(null, true);
      return api(originalRequest);
    } catch (refreshErr) {
      // Refresh failed: clean up and log out
      processQueue(refreshErr, false);
      authStore.getState().clearAuth();

      // Let useSession handle redirect

      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
