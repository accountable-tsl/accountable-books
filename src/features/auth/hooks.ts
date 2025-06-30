import { companyStore } from "@/domains/company/store";
import { fetchSession, handleLogout } from "@/features/auth/api";
import { authStore, sessionStore } from "@/features/auth/store";
import { routes } from "@/shared/routes/routes";
import { LogoutOptions } from "./types";
import { useCallback, useEffect, useState } from "react";
import { isPublicRoute } from "@/shared/routes/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";

export const clearSessionFn = () => {
  authStore.getState().clearAuth();
  const theme = localStorage.getItem("theme");
  localStorage.clear();
  if (theme) {
    localStorage.setItem("theme", theme);
  }
  queryClient.clear();
};

export const useAuth = () => {
  const { user, csrfToken, clearAuth, setAuth } = authStore((s) => s);

  const isLoggedIn = !!user;

  const logout = useCallback(async (options?: LogoutOptions) => {
    try {
      const res = await handleLogout();
      console.log(res);
    } catch (error) {
      console.error("Logout failed, forcing client clear anyway", error);
    } finally {
      clearSessionFn();
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
  }, []);

  const currentCompany = user?.companies.find(
    (c) => c.id === user.currentCompanyId
  );

  // const isLoggedIn = !!user && !checkingSession && sessionValid === true;
  // const user = authStore((s) => s.user);
  // const setUser = authStore((s) => s.setUser);
  // const clearCompany = companyStore((s) => s.clearCompany);
  // const checkingSession = sessionStore((s) => s.checkingSession);
  // const setCheckingSession = sessionStore((s) => s.setCheckingSession);
  // const sessionValid = sessionStore((s) => s.sessionValid);
  // const setSessionValid = sessionStore((s) => s.setSessionValid);
  // const incrementFailedAttempts = sessionStore(
  //   (s) => s.incrementFailedAttempts
  // );
  // const resetFailedAttempts = sessionStore((s) => s.resetFailedAttempts);

  // const clearSession = () => clearSessionFn();
  // const logout = async (options?: LogoutOptions) => {
  //   try {
  //     const res = await backendLogout();
  //     console.log(res);
  //   } catch (err) {
  //     console.error("Logout failed, forcing client clear anyway", err);
  //   } finally {
  //     clearSession();

  //     if (options?.redirectTo !== false) {
  //       let target: string = routes.login.staticPath; //default fallback

  //       if (options?.redirectTo) {
  //         target = options.redirectTo;
  //       }

  //       if (options?.query) {
  //         const queryString = new URLSearchParams(options.query).toString();
  //         target += `?${queryString}`;
  //       }
  //       window.location.replace(target);
  //     }

  //     return true;
  //   }
  // };

  return {
    user,
    csrfToken,
    clearAuth,
    setAuth,
    logout,

    isLoggedIn,
    currentCompany,
    currentCompanyId: user?.currentCompanyId,
    firmSlug: currentCompany?.assignedFirmSlug,
    companyType: currentCompany?.type,
  };

  // return {
  //   user,
  //   isLoggedIn,
  //   setUser,
  //   logout,
  //   clearSession,
  //   checkingSession,
  //   setCheckingSession,
  //   sessionValid,
  //   setSessionValid,
  //   incrementFailedAttempts,
  //   resetFailedAttempts,
  // };
};

export const useSessionLoader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, setAuth } = useAuth();

  const [loading, setLoading] = useState(true); // Start with true to prevent flickering
  const isPublic = isPublicRoute(location.pathname);

  const loadSession = useCallback(async () => {
    // Skip if user is already authenticated
    if (user && isLoggedIn) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch session
      const res = await fetchSession();
      if (res.success && res.data) {
        setAuth(res.data.user, res.data.csrfToken);
      } else {
        clearSessionFn();
        if (!isPublic) navigate(routes.login.staticPath, { replace: true });
      }
    } catch (error) {
      clearSessionFn();
      if (!isPublic) navigate(routes.login.staticPath, { replace: true });
    } finally {
      setLoading(false);
    }
  }, [user, isLoggedIn, location.pathname, navigate, setAuth]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return { loading };
};
