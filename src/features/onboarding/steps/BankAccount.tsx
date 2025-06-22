import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectBankAccount from "@/features/bankConnection/connectViaFeed/ConnectBankAccount";
import { BankTransactionImporter } from "@/features/bankConnection/manualUpload/BankTransactionImporter";
import { BankTransactionImportOptions } from "@/features/bankConnection/manualUpload/types";
import { useState } from "react";
import { updateCompanyOnboardingStatus } from "../service";
import { useAuth } from "@/features/auth/hooks";
import { useCompany } from "@/domains/company/store";
import { toast } from "sonner";
import { fetchSession } from "@/features/auth/service";
import { OnboardingStatus } from "@/domains/company/types";
import { handleDemoAccess } from "@/features/demo/utils";

export const BankAccount = ({
  onBankAccountComplete,
}: {
  onBankAccountComplete: (status: OnboardingStatus) => void;
}) => {
  const { user } = useAuth();
  const { companyId, companyType } = useCompany();

  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem("bankAccountActiveTab");
    return stored === "connect" || stored === "upload" ? stored : "connect";
  });
  const [bankConnectionOrUploadFailed, setBankConnectionOrUploadFailed] =
    useState(true);

  const bankTxImporterOptions: BankTransactionImportOptions = {
    className: "p-0 pb-4 gap-3 max-w-3xl mx-auto w-full hidden lg:flex",
    toastPosition: "bottom-right",
  };

  const connectBankOptions = {
    className: "p-0 pb-4",
    stepClassName: "max-w-3xl mx-auto w-full",
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem("bankAccountActiveTab", value);
  };

  const handleDemoCompanyAccess = () => {
    if (!companyType) {
      toast.error("We are sorry, Demo company is not available at this time.");
      return;
    }
    handleDemoAccess({
      companyType,
    });
  };

  const handleUploadSuccess = async (response: any) => {
    console.log("Upload success", response);
    if (response && !response.success) {
      setBankConnectionOrUploadFailed(true);
      return;
    }

    try {
      // Update company onboarding status to complete
      const res = await updateCompanyOnboardingStatus({
        userId: user?.id || "",
        companyId: companyId || "",
      });

      if (!res.success) {
        toast.error(res.message || "Failed to finalize onboarding");
        return;
      }

      await fetchSession();
      onBankAccountComplete("onboarding_complete");
    } catch (err) {
      toast.error(
        "Something went wrong finalizing onboarding. Please try again or refresh."
      );
    }
  };

  if (bankConnectionOrUploadFailed) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col gap-4 items-center">
          <p>Bank connection or upload failed. Please try again.</p>
          <div className="space-x-3">
            <Button
              variant="outline"
              onClick={handleDemoCompanyAccess}
              // On click, navigate to demo company... we shouldn't block demo company at all
            >
              I'll do it later
            </Button>
            <Button onClick={() => setBankConnectionOrUploadFailed(false)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="h-full mx-auto w-full p-4 overflow-hidden"
    >
      <TabsList className="grid grid-cols-2 bg-transparent border flex-shrink-0 max-w-3xl w-full mx-auto">
        <TabsTrigger value="connect">Connect Bank Account</TabsTrigger>
        <TabsTrigger value="upload">Manually Add Bank Account</TabsTrigger>
      </TabsList>

      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin-2px">
        {activeTab === "connect" && (
          <TabsContent value="connect">
            <ConnectBankAccount
              options={connectBankOptions}
              onSuccess={handleUploadSuccess}
            />
          </TabsContent>
        )}

        {activeTab === "upload" && (
          <TabsContent value="upload" className="flex-1 min-h-0">
            <BankTransactionImporter
              options={bankTxImporterOptions}
              onImportSuccess={handleUploadSuccess}
            />
            <div className="flex items-center justify-center text-center h-full lg:hidden p-8">
              To access this page, please view on a larger screen or device
            </div>
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
};
