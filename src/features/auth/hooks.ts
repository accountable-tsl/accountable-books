import { fetchSession, handleLogout } from "@/features/auth/api";
import { authStore } from "@/features/auth/store";
import { routes } from "@/shared/routes/routes";
import { LogoutOptions } from "./types";
import { useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

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
        let target: string = routes.auth.login.staticPath; //default fallback

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

  const currentCompany = user?.currentCompany;

  const hasAppAccess = currentCompany
    ? currentCompany.onboarding.canAccessApp
    : false;

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
    hasAppAccess,
    currentCompany,
    currentCompanyId: user?.currentCompanyId,
    firmSlug: currentCompany?.assignedFirmSlug,
    companyType: currentCompany?.companyType,
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

// export const useSessionLoader = () => {
//   const location = useLocation();
//   const navigate = useNavigate();
//   const { setAuth } = useAuth();
//   const { data, isLoading, isError, refetch } = useSessionQuery();
//   const { data: authData, success, message } = data || {};

//   const hasHandledSession = useRef(false);

//   console.log("A", authData?.user.currentCompany);
//   let callCount = 0;
//   console.log("🔁 useSessionLoader call", ++callCount);

//   const isPublic = isPublicRoute(location.pathname);

//   useEffect(() => {
//     if (hasHandledSession.current) return;

//     if (authData?.user && authData?.csrfToken) {
//       setAuth(authData?.user, authData?.csrfToken);
//       hasHandledSession.current = true;
//     }

//     if (isError && !isPublic) {
//       clearSessionFn();
//       navigate(routes.auth.login.staticPath, { replace: true });
//       hasHandledSession.current = true;
//     }
//   }, [authData?.user, authData?.csrfToken, isPublic, navigate]);

//   return { loading: isLoading, refetch };
// };

export const useSessionQuery = () => {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchSession, // returns { user, csrfToken }
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    // retry: 1,
  });
};
