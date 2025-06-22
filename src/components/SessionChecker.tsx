import { fetchSession } from "@/features/auth/service";
import { useCompany } from "@/domains/company/store";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks";
import { useLocation } from "react-router-dom";
import { isPublicRoute } from "@/shared/routes/utils";
import { sessionStore } from "@/features/auth/store";
import { onboardingStatus } from "@/domains/company/types";
import { routes } from "@/shared/routes/routes";
import { isDemoMode } from "@/features/demo/utils";

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
  const isDemo = isDemoMode();

  const failedAttempts = sessionStore((s) => s.failedAttempts);
  const MAX_ATTEMPTS = 3;
  const isOnboardingPage = location.pathname.includes("/onboarding");

  useEffect(() => {
    const validateSession = async () => {
      try {
        setCheckingSession(true);

        if (isDemo) {
          // Skip validation in demo mode
          setSessionValid(true);
          setCheckingSession(false);
          return;
        }

        const res = await fetchSession();
        if (!res.success || !res.data) {
          throw new Error(res.message || "Session validation failed");
        }
        setUser(res.data.user);
        setSessionValid(true);
        resetFailedAttempts();
        fetchCompany(res.data.company.id);

        if (
          res.data.company.onboardingStatus !==
            onboardingStatus.enum.onboarding_complete &&
          !isOnboardingPage &&
          !isPublicRoute(location.pathname)
        ) {
          window.location.replace(
            routes.onboarding.index.buildPath({
              companyId: res.data.company.id,
            })
          );
        }
      } catch (err) {
        incrementFailedAttempts();
        setSessionValid(false);
        if (failedAttempts + 1 >= MAX_ATTEMPTS) {
          if (!isPublicRoute(location.pathname)) {
            clearSession();
            window.location.replace(routes.login.staticPath);
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
