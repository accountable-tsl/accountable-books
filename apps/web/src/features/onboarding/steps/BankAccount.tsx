import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConnectBankAccount from '@/features/bankConnection/connectViaFeed/ConnectBankAccount';
import { BankTransactionImporter } from '@/features/bankConnection/manualUpload/BankTransactionImporter';
import { BankTransactionImportOptions } from '@/features/bankConnection/manualUpload/types';
import { useCallback, useState } from 'react';
import { updateCompanyOnboardingStatus } from '../api';
import { useCompany } from '@/domains/company/store';
import { toast } from 'sonner';
import { fetchSession } from '@/features/auth/api';
import { OnboardingStatus } from '@/domains/company/types';
import { useSession } from '@/features/auth/Session';
import { useNavigate } from 'react-router-dom';

export const BankAccount = ({
  onBankAccountComplete,
}: {
  onBankAccountComplete?: (status: OnboardingStatus) => void;
}) => {
  const { tenantRoutes } = useSession();
  const { companyId, companyType } = useCompany();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem('bankAccountActiveTab');
    return stored === 'connect' || stored === 'upload' ? stored : 'connect';
  });
  const [bankConnectionOrUploadFailed, setBankConnectionOrUploadFailed] = useState(false);

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
      <div className="h-full flex-1 flex items-center justify-center">
        <div className="flex flex-col gap-4 items-center justify-center">
          <p>Bank connection or upload failed. Please try again.</p>
          <div className="space-x-3">
            <Button
              variant="outline"
              onClick={handleDemoCompanyAccess}
              // TODO: On click, navigate to demo company... we shouldn't block demo company at all
            >
              I'll do it later
            </Button>
            <Button onClick={() => setBankConnectionOrUploadFailed(false)}>Try again</Button>
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
        className="h-full mx-auto w-full p-4 overflow-hidden relative"
      >
        <TabsList className="grid grid-cols-2 bg-transparent border flex-shrink-0 max-w-3xl w-full mx-auto">
          <TabsTrigger value="connect">Connect Bank Account</TabsTrigger>
          <TabsTrigger value="upload">Manually Add Bank Account</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-auto scrollbar-thin-2px">
          {activeTab === 'connect' && (
            <TabsContent value="connect">
              <ConnectBankAccount options={connectBankOptions} onSuccess={navigateToDashboard} />
            </TabsContent>
          )}

          {activeTab === 'upload' && (
            <TabsContent value="upload" className="flex-1 min-h-0">
              <BankTransactionImporter
                options={bankTxImporterOptions}
                onImportSuccess={navigateToDashboard}
              />
              <div className="flex items-center justify-center text-center h-full lg:hidden p-8">
                To access this page, please view on a larger screen or device
              </div>
            </TabsContent>
          )}
        </div>
        <div
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2"
          onClick={navigateToDashboard}
        >
          <span className="text-md hover:underline cursor-pointer">Skip for now</span>
        </div>
      </Tabs>
    </>
  );
};
