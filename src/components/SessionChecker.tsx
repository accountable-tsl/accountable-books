import { fetchSession } from "@/features/auth/service";
import { useCompany } from "@/domains/company/store";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks";

export function SessionChecker() {
  const { setUser, clearSession, setCheckingSession } = useAuth();
  const { fetchCompany } = useCompany();

  console.log("SessionChecker touched");
  useEffect(() => {
    const validateSession = async () => {
      try {
        const res = await fetchSession();
        if (res.success && res.data) {
          setUser(res.data);
          fetchCompany(res.data.currentCompanyId);
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
