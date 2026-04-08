import type { BankTransactionImportOptions } from '@/domains-pending-migration/bankConnection/manualUpload/types';
import type { OnboardingStatus } from '@/modules/company/companies';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConnectBankAccount from '@/domains-pending-migration/bankConnection/connectViaFeed/ConnectBankAccount';
import { BankTransactionImporter } from '@/domains-pending-migration/bankConnection/manualUpload/BankTransactionImporter';
import { useSession } from '@session';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

export const BankAccount = ({
  onBankAccountComplete,
}: {
  onBankAccountComplete?: (status: OnboardingStatus) => void;
}) => {
  const { tenantRoutes, companyId, companyType } = useSession();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem('bankAccountActiveTab');
    return stored === 'connect' || stored === 'upload' ? stored : 'connect';
  });
  const [bankConnectionOrUploadFailed, setBankConnectionOrUploadFailed] =
    useState(false);

  const bankTxImporterOptions: BankTransactionImportOptions = {
    className: 'p-0 pb-4 gap-3 max-w-3xl mx-auto w-full hidden lg:flex',
    toastPosition: 'bottom-right',
  };

  const connectBankOptions = {
    className: 'p-0 pb-4',
    stepClassName: 'max-w-3xl mx-auto w-full',
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem('bankAccountActiveTab', value);
  };

  const handleDemoCompanyAccess = () => {
    if (!companyType) {
      toast.error('We are sorry, Demo company is not available at this time.');
      return;
    }
  };

  const navigateToDashboard = useCallback(() => {
    navigate(tenantRoutes?.general.welcome() || '/', { replace: true });
  }, [navigate, tenantRoutes]);

  // const handleUploadSuccess = async (response: any) => {
  //   navigate(tenantRoutes?.general.welcome() || "/");
  // };

  if (bankConnectionOrUploadFailed) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <p>Bank connection or upload failed. Please try again.</p>
          <div className="space-x-3">
            <Button
              variant="outline"
              onClick={handleDemoCompanyAccess}
              // TODO: On click, navigate to demo company... we shouldn't block demo company at all
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
    <>
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="relative mx-auto h-full w-full overflow-hidden p-4"
      >
        <TabsList className="mx-auto grid w-full max-w-3xl flex-shrink-0 grid-cols-2 border bg-transparent">
          <TabsTrigger value="connect">Connect Bank Account</TabsTrigger>
          <TabsTrigger value="upload">Manually Add Bank Account</TabsTrigger>
        </TabsList>

        <div className="scrollbar-thin-2px min-h-0 flex-1 overflow-auto">
          {activeTab === 'connect' && (
            <TabsContent value="connect">
              <ConnectBankAccount
                options={connectBankOptions}
                onSuccess={navigateToDashboard}
              />
            </TabsContent>
          )}

          {activeTab === 'upload' && (
            <TabsContent value="upload" className="min-h-0 flex-1">
              <BankTransactionImporter
                options={bankTxImporterOptions}
                onImportSuccess={navigateToDashboard}
              />
              <div className="flex h-full items-center justify-center p-8 text-center lg:hidden">
                To access this page, please view on a larger screen or device
              </div>
            </TabsContent>
          )}
        </div>
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 transform"
          onClick={navigateToDashboard}
        >
          <span className="text-md cursor-pointer hover:underline">
            Skip for now
          </span>
        </div>
      </Tabs>
    </>
  );
};
