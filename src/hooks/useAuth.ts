import { companyStore } from "@/domains/company/store";
import { backendLogout } from "@/features/auth/service";
import { authStore, sessionStore } from "@/features/auth/store";
import { staticRoutes } from "@/utils/routes";

export const useAuth = () => {
  const user = authStore((s) => s.user);
  const setUser = authStore((s) => s.setUser);
  const clearCompany = companyStore((s) => s.clearCompany);
  const checkingSession = sessionStore((s) => s.checkingSession);
  const setCheckingSession = sessionStore((s) => s.setCheckingSession);

  const isLoggedIn = !!user && !checkingSession;

  const clearSession = () => {
    setUser(null);
    clearCompany();
    localStorage.removeItem("auth-storage");
    localStorage.removeItem("company-store");
  };
  const logout = async () => {
    try {
      await backendLogout();
    } catch (err) {
      console.error("Logout failed, forcing client clear anyway", err);
    } finally {
      clearSession();
      window.location.replace(staticRoutes.auth.login);
      return true;
      //   const currentPath = location.pathname;
      //   const authPaths = ["/login", "/signup", "/forgot-password"];

      //   if (!authPaths.includes(currentPath)) {
      //     return true;
      //   }
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
  };
};
