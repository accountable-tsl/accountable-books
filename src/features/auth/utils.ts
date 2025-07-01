import { handleLogin } from "@/features/auth/api";
import { toast } from "sonner";
import { authStore } from "./store";
import { clearSessionFn } from "./hooks";
import { buildCanonicalUrl } from "@/shared/routes/utils";
import { routes } from "@/shared/routes/routes";

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
  onError?: (error: any) => void;
  setError?: (...args: any[]) => void;
  displayToast?: boolean;
}): Promise<{ success: boolean; data?: any; canAccessApp?: boolean }> => {
  try {
    const loginFn = handleLogin({ email, password });
    displayToast &&
      toast.promise(loginFn, {
        loading: "Logging in...",
        success: "Login successful!",
        error: (error) => {
          onError?.(error);
          return error.message || "Login failed";
        },
      });

    const res = await loginFn;
    if (!res.success || !res.data || !res.data.user || !res.data.csrfToken) {
      if (res?.code === "INVALID_CREDENTIALS") {
        const message = res.message || "Invalid email or password";
        setError?.("email", { type: "manual", message });
        setError?.("password", { type: "manual", message });
      }

      await (logout?.() ?? clearSessionFn());
      displayToast && toast.error(res.message || "Login failed");
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
      displayToast && toast.error("Login failed");
      return { success: false };
    }

    onSuccess?.(res.data);
    const canAccessApp = currentCompany.onboarding?.canAccessApp ?? false;

    return { success: true, data: res.data, canAccessApp };
  } catch (error) {
    await (logout?.() ?? clearSessionFn());
    displayToast && toast.error("Login failed");
    onError?.(error);
    return { success: false };
  }
};

type LoginParams = Parameters<typeof performLoginFlow>[0];
export async function loginAndRedirect(params: LoginParams) {
  const result = await performLoginFlow(params);
  if (!result.success) return result;

  const dashboardUrl = buildCanonicalUrl({
    user: result.data.user,
    routeKey: "general.dashboard",
    routeParams: {},
  });
  const onboardingUrl = routes.onboarding.router.staticPath;

  if (result.canAccessApp && dashboardUrl) {
    window.location.replace(dashboardUrl);
  } else {
    window.location.replace(onboardingUrl);
  }
  return result;
}
