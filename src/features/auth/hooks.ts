import { companyStore } from "@/domains/company/store";
import { backendLogout } from "@/features/auth/service";
import { authStore, sessionStore } from "@/features/auth/store";
import { routes } from "@/shared/routes/routes";
import { LogoutOptions } from "./types";

export const clearSessionFn = () => {
  authStore.getState().setUser(null);
  companyStore.getState().clearCompany();
  const theme = localStorage.getItem("theme");
  localStorage.clear();
  if (theme) {
    localStorage.setItem("theme", theme);
  }
};

export const useAuth = () => {
  const user = authStore((s) => s.user);
  const setUser = authStore((s) => s.setUser);
  const clearCompany = companyStore((s) => s.clearCompany);
  const checkingSession = sessionStore((s) => s.checkingSession);
  const setCheckingSession = sessionStore((s) => s.setCheckingSession);
  const sessionValid = sessionStore((s) => s.sessionValid);
  const setSessionValid = sessionStore((s) => s.setSessionValid);
  const incrementFailedAttempts = sessionStore(
    (s) => s.incrementFailedAttempts
  );
  const resetFailedAttempts = sessionStore((s) => s.resetFailedAttempts);

  const isLoggedIn = !!user && !checkingSession && sessionValid === true;

  const clearSession = () => clearSessionFn();
  const logout = async (options?: LogoutOptions) => {
    try {
      const res = await backendLogout();
      console.log(res);
    } catch (err) {
      console.error("Logout failed, forcing client clear anyway", err);
    } finally {
      clearSession();

      if (options?.redirectTo !== false) {
        let target: string = routes.login.staticPath; //default fallback

        if (options?.redirectTo) {
          target = options.redirectTo;
        }

        if (options?.query) {
          const queryString = new URLSearchParams(options.query).toString();
          target += `?${queryString}`;
        }
        window.location.replace(target);
      }

      return true;
    }
  };

  return {
    user,
    isLoggedIn,
    setUser,
    logout,
    clearSession,
    checkingSession,
    setCheckingSession,
    sessionValid,
    setSessionValid,
    incrementFailedAttempts,
    resetFailedAttempts,
  };
};
