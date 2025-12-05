import { isAxiosError } from 'axios';
import { toast } from 'sonner';

import {
  authStore,
  type AuthUserContext,
  clearLogoutReason,
  clearSessionFn,
  handleLogin,
} from '@/modules/auth';
import { routes } from '@/shared/routes/routes';
import { buildCanonicalUrl } from '@/shared/routes/utils';

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
    clearLogoutReason();

    const res = await handleLogin({ email, password });
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
