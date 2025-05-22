import { fetchSession } from "@/features/auth/service";
import { useCompany } from "@/domains/company/store";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks";
import { useLocation } from "react-router-dom";
import { isPublicRoute } from "@/shared/routes/utils";
import { sessionStore } from "@/features/auth/store";

export function SessionChecker() {
  const location = useLocation();
  const {
    setUser,
    clearSession,
    setCheckingSession,
    setSessionValid,
    incrementFailedAttempts,
    resetFailedAttempts,
  } = useAuth();
  const { fetchCompany } = useCompany();
  const failedAttempts = sessionStore((s) => s.failedAttempts);
  const MAX_ATTEMPTS = 3;

  useEffect(() => {
    const validateSession = async () => {
      try {
        setCheckingSession(true);
        const res = await fetchSession();
        if (res.success && res.data) {
          setUser(res.data);
          setSessionValid(true);
          resetFailedAttempts();
          fetchCompany(res.data.currentCompanyId);
        } else {
          setSessionValid(false);
          if (!isPublicRoute(location.pathname)) {
            clearSession();
          }
        }
      } catch (err) {
        incrementFailedAttempts();
        setSessionValid(false);
        if (failedAttempts + 1 >= MAX_ATTEMPTS) {
          if (!isPublicRoute(location.pathname)) {
            clearSession();
          }
          resetFailedAttempts();
        }
      } finally {
        setCheckingSession(false); // very important
      }
    };

    validateSession();
  }, [location.pathname]);

  return null;
}
