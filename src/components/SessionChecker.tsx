import { fetchSession } from "@/features/auth/service";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/domains/company/store";
import { useEffect } from "react";

export function SessionChecker() {
  const { setUser, clearSession, setCheckingSession } = useAuth();
  const { fetchCompany } = useCompany();

  useEffect(() => {
    const validateSession = async () => {
      try {
        const res = await fetchSession();
        if (res.success && res.data) {
          setUser(res.data);
          await fetchCompany(res.data.currentCompanyId);
        } else {
          clearSession();
        }
      } catch (err) {
        clearSession();
      } finally {
        setCheckingSession(false); // very important
      }
    };

    validateSession();
  }, [setUser, setCheckingSession, fetchCompany]);

  return null;
}
