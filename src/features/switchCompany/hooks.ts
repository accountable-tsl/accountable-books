import { useNavigate } from "react-router-dom";
import { SwitchCompanyOpts } from "@/features/switchCompany/types";
import { useCompany } from "@/domains/company/store";
import { useRef, useState } from "react";
import { buildTenantUrl, routes } from "@/shared/routes/routes";
import { toast } from "sonner";
import { useAuth } from "../auth/hooks";
import { switchCompanyApi } from "./api";

export function useCompanySwitch() {
  const [isSwitching, setIsSwitching] = useState(false);

  const navigate = useNavigate();
  const { setUser } = useAuth();
  const {
    companyId: currentCompanyId,
    slug: currentSlug,
    fetchCompany,
  } = useCompany();

  const originalCompanyRef = useRef<{
    companyId: string | null;
    slug: string | null;
  }>({ companyId: null, slug: null });

  const LOCALSTORAGE_KEY = "original-company-for-demo";

  function setOriginalCompany(companyId: string, slug: string) {
    originalCompanyRef.current = { companyId, slug };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ companyId, slug }));
  }

  function getOriginalCompany() {
    // Prefer in-memory, fallback to localStorage
    return originalCompanyRef.current.companyId
      ? originalCompanyRef.current
      : JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || "null");
  }

  function clearOriginalCompany() {
    originalCompanyRef.current = { companyId: null, slug: null };
    localStorage.removeItem(LOCALSTORAGE_KEY);
  }

  const switchCompany = async ({
    companyId,
    onError,
    onSuccess,
    rememberCurrentAsOriginal, // Pass true when switching to demo
  }: SwitchCompanyOpts) => {
    // Prevent concurrent switches
    if (isSwitching) {
      toast.info("Company switch already in progress");
      return;
    }
    setIsSwitching(true);

    try {
      if (rememberCurrentAsOriginal && currentCompanyId && currentSlug) {
        setOriginalCompany(currentCompanyId, currentSlug);
      }

      if (isSwitching) {
        toast.loading("Switching...");
      }

      const res = await switchCompanyApi({
        newCompanyId: companyId,
      });
      console.log(res);

      if (!res.success || !res.data) {
        toast.error(res.message || "Switch failed");
        onError?.(res.message || "Switch failed");
        return;
      }

      const { user, company, csrfToken } = res.data;
      console.log(company);
      const slug = company.assignedFirmSlug || user.assignedFirmSlug || "";
      const newCompanyId = company.id || user.currentCompanyId || "";

      if (!user || !company || !csrfToken) {
        toast.error("Failed to switch company.");
        return onError?.("Failed to switch company.");
      }
      localStorage.setItem("csrfToken", csrfToken);
      setUser(user);
      await fetchCompany(newCompanyId);

      const tenantUrl = buildTenantUrl({
        firmSlug: slug,
        companyId: newCompanyId,
        path: routes.dashboard.relativePath,
      });

      console.log("tenantUrl", tenantUrl);
      window.location.href = tenantUrl;
      //   window.location.replace (tenantUrl);

      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error(errorMessage);
      onError?.(errorMessage);
      return;
    } finally {
      setIsSwitching(false);
    }
  };

  const handleExitDemo = async ({
    onError,
    onSuccess,
  }: {
    onError?: (err: any) => void;
    onSuccess?: () => void;
  } = {}) => {
    const { companyId, slug } = getOriginalCompany() || {};
    if (companyId && slug) {
      await switchCompany({ companyId, onError, onSuccess });
      clearOriginalCompany();
    } else {
      const msg = "Original company not found in this session.";
      toast.error(msg);
      onError?.(msg);
    }
  };

  return {
    switchCompany,
    handleExitDemo,
    isSwitching,
    // isCurrentCompanyDemo,
    // isCurrentCompanyDemoByFlag,
  };
}
