import { handleLogin } from '@/modules/auth/api';
import { toast } from 'sonner';
import { authStore } from './store';
import { clearSessionFn } from './hooks';
import { buildCanonicalUrl } from '@/shared/routes/utils';
import { routes } from '@/shared/routes/routes';
import type { AuthUserContext, SessionContextType } from './types';
import { isAxiosError } from 'axios';

// Logout reason with 12-hour expiration
export const setLogoutReason = (reason: 'expired' | 'manual' | 'forced') => {
  localStorage.setItem('logoutReason', JSON.stringify({ reason, timestamp: Date.now() }));
};

export const getLogoutReason = (): string | null => {
  const data = localStorage.getItem('logoutReason');
  if (!data) return null;

  try {
    const { reason, timestamp } = JSON.parse(data);
    if (Date.now() - timestamp > 12 * 60 * 60 * 1000) {
      localStorage.removeItem('logoutReason');
      return null;
    }
    return reason;
  } catch {
    localStorage.removeItem('logoutReason');
    return null;
  }
};

export const clearLogoutReason = () => localStorage.removeItem('logoutReason');

export const performLoginFlow = async ({
  email,
  password,
  logout,
  setAuth,
  setError,
  onSuccess,
  onError,
  displayToast = true,
}: {
  email: string;
  password: string;
  setAuth?: (user: any, csrfToken: string) => void;
  logout?: (options?: any) => Promise<any>;
  onSuccess?: (data: any) => void;
  onError?: (error: unknown) => void;
  setError?: (...args: any[]) => void;
  displayToast?: boolean;
}): Promise<{
  success: boolean;
  data?: {
    user: AuthUserContext;
    csrfToken: string;
  };
  canAccessApp?: boolean;
}> => {
  try {
    const loginFn = handleLogin({ email, password });
    clearLogoutReason();

    const res = await loginFn;
    // wait for 2 seconds, while waiting, show toast, logging in
    await new Promise((resolve) => {
      if (displayToast) toast.info('Logging in...');
      setTimeout(resolve, 2000);
    });

    if (!res.success || !res.data || !res.data.user || !res.data.csrfToken) {
      if (res?.code === 'INVALID_CREDENTIALS') {
        const message = res.message || 'Invalid email or password';
        setError?.('email', { type: 'manual', message });
        setError?.('password', { type: 'manual', message });
      }

      await (logout?.() ?? clearSessionFn());
      if (displayToast) toast.error(res.message || 'Login failed');
      return { success: false };
    }

    const { user, csrfToken } = res.data;
    if (setAuth) {
      setAuth(user, csrfToken);
    } else {
      authStore.getState().setAuth(user, csrfToken);
    }

    const currentCompany = user.currentCompany;
    if (!currentCompany || !currentCompany.onboarding) {
      await (logout?.() ?? clearSessionFn());
      if (displayToast) toast.error('Login failed');
      return { success: false };
    }

    onSuccess?.(res.data);
    const canAccessApp = currentCompany.onboarding?.canAccessApp ?? false;

    return { success: true, data: res.data, canAccessApp };
  } catch (error: unknown) {
    if (isAxiosError(error) || error instanceof Error) {
      await (logout?.() ?? clearSessionFn());
      if (displayToast) toast.error(error?.message ?? 'Login failed');
      onError?.(error);
      return { success: false };
    }

    if (displayToast) toast.error('Login failed');
    return { success: false };
  }
};

type LoginParams = Parameters<typeof performLoginFlow>[0];
export async function loginAndRedirect(params: LoginParams) {
  const result = await performLoginFlow(params);
  if (!result.success || !result.data) return result;

  const dashboardUrl = buildCanonicalUrl({
    user: result.data.user,
    routeKey: 'general.dashboard',
    routeParams: {},
  });
  const onboardingUrl = routes.onboarding.index.staticPath;

  if (result.canAccessApp && dashboardUrl) {
    window.location.replace(dashboardUrl);
  } else {
    window.location.replace(onboardingUrl);
  }
  return result;
}
