import { companyStore } from "@/domains/company/store";
import { CompanyType } from "@/domains/company/types";
import { routes } from "@/shared/routes/routes";
import { clearSessionFn } from "../auth/hooks";
import { toast } from "sonner";
import { authStore } from "../auth/store";
import { grantDemoAccess } from "@/domains/permissions/api";

export const DEMO_COMPANY_IDS: Record<CompanyType, string> = {
  individual: "indDemo",
  accounting_firm: "firmDemo",
  business: "firmDemo",
};
export const handleDemoAccess = async ({
  companyType,
}: {
  companyType: CompanyType;
}) => {
  try {
    const { companyId: currentCompanyId } = companyStore.getState();
    const user = authStore.getState().user;

    console.log(user);
    const demoCompanyId = DEMO_COMPANY_IDS[companyType];
    if (!demoCompanyId || !user) {
      toast.error("We are sorry, Demo company is not available at this time.");
      return;
    }

    // Save current company for later return
    if (
      currentCompanyId &&
      !Object.values(DEMO_COMPANY_IDS).includes(currentCompanyId)
    ) {
      localStorage.setItem("originalCompanyId", currentCompanyId);
    }

    const grantAccess = await grantDemoAccess({
      companyId: demoCompanyId,
      userId: user?.id,
    });
    console.log(grantAccess);

    // await companyStore.getState().fetchCompany(demoCompanyId);

    window.location.replace(
      routes.dashboard.buildPath({ companyId: demoCompanyId })
    );
  } catch (error) {
    toast.error("An unexpected error occurred");
  }
};

export const handleExitDemo = async () => {
  //   const fetchCompany = companyStore.getState().fetchCompany;
  const originalCompanyId = localStorage.getItem("originalCompanyId");

  if (!originalCompanyId) {
    // Redirect to login or landing page as fallback
    window.location.replace(routes.login.staticPath);
    clearSessionFn();
    return;
  }

  await companyStore.getState().fetchCompany(originalCompanyId);
  localStorage.removeItem("originalCompanyId");
  window.location.replace(
    routes.dashboard.buildPath({ companyId: originalCompanyId })
  );
};

export const isDemoMode = (): boolean => {
  const { companyId } = companyStore.getState();
  return Object.values(DEMO_COMPANY_IDS).includes(companyId || "");
};

export const getCurrentDemoType = (): CompanyType | null => {
  const { companyId } = companyStore.getState();
  const entry = Object.entries(DEMO_COMPANY_IDS).find(
    ([_, id]) => id === companyId
  );
  return entry ? (entry[0] as CompanyType) : null;
};
