import { useState } from 'react';
import { useSession } from '@session';
import { WelcomeStep } from '../ui/steps/welcome-step';
import { CountrySelectStep } from '../ui/steps/country-select-step';
import { ProviderSelectStep } from '../ui/steps/provider-select-step';
import { ProviderWidget } from '../ui/provider-widget';
import { ClassifyAccountStep } from '../ui/steps/classify-account-step';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';
import { useNavigate } from 'react-router';
import type { BankProvider, ProviderSelectionResult } from '@/modules/banking/providers';
import {
  useBanking,
  useConnectAccounts,
  useCountrySelection,
  useCreateLinkToken,
  type ConnectAccountsResponse,
  type CountryDisplay,
} from '@/modules/banking/connections';

type FlowStep =
  | 'welcome'
  | 'country-select'
  | 'provider-select'
  | 'connecting'
  | 'classify-accounts'
  | 'success';

export function BankConnectionFlow() {
  const [currentStep, setCurrentStep] = useState<FlowStep>('welcome');
  const [selectedProvider, setSelectedProvider] = useState<BankProvider | null>(null);
  const [selectionStrategy, setSelectionStrategy] = useState<ProviderSelectionResult | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectAccountsResponse>({
    bank: { id: '', name: '', logoUrl: null },
    accounts: [],
  });

  const { user, companyId, companyType, loading: sessionLoading, tenantRoutes } = useSession();
  const navigate = useNavigate();
  const createLinkTokenMutation = useCreateLinkToken();
  const connectAccountsMutation = useConnectAccounts();

  const { supportedCountries, getSelectionStrategy } = useBanking();
  const {
    detectedCountry,
    selectedCountry,
    setUserSelectedCountry,
    detectingLocation,
    countryCategories,
    detectedCountryIsSupported,
    selectedCountryIsSupported,
  } = useCountrySelection(supportedCountries);

  const handleCountrySelect = (country: CountryDisplay) => {
    const selectedCountryData = {
      id: country.id || '',
      code: country.code,
      name: country.name || '',
      phoneCode: '',
      flag: country.flag,
    };
    setUserSelectedCountry(selectedCountryData);

    if (country.isSupported) {
      // Get provider selection strategy for this country
      const strategy = getSelectionStrategy(country.code);
      setSelectionStrategy(strategy);

      if (strategy.type === 'auto-direct' && strategy.provider) {
        // Auto-select the only available provider and create token
        setSelectedProvider(strategy.provider);
        createLinkToken(strategy.provider);
      } else if (strategy.type === 'show-selection') {
        // Show provider selection step
        setCurrentStep('provider-select');
      }
    } else {
      handleSkipToCSV();
    }
  };

  const stepWrapperClass = 'md:min-w-md w-full max-w-lg flex flex-col gap-6 mx-auto';

  const handleWelcomeContinue = () => {
    if (selectedCountry && selectedCountryIsSupported) {
      const strategy = getSelectionStrategy(selectedCountry.code);
      setSelectionStrategy(strategy);
      if (strategy.type === 'auto-direct' && strategy.provider) {
        // Auto-select the only available provider and create token
        setSelectedProvider(strategy.provider);
        createLinkToken(strategy.provider);
      } else if (strategy.type === 'show-selection') {
        // Show provider selection step
        setCurrentStep('provider-select');
      } else {
        setCurrentStep('provider-select');
      }
    } else {
      setCurrentStep('country-select');
    }
  };

  const handleChangeCountry = () => {
    setUserSelectedCountry(null);
    setCurrentStep('country-select');
  };

  const handleSkipToCSV = () => {
    if (tenantRoutes) {
      navigate(tenantRoutes?.banking.upload());
    }
  };

  const navigateAway = () => {
    navigate(tenantRoutes?.accounting.catEngine() || '/');
  };

  const createLinkToken = async (provider: BankProvider) => {
    if (!user?.id || !companyId) {
      toast.error('Something went wrong, please try again');
      return;
    }

    createLinkTokenMutation.mutate(
      {
        provider: provider.key,
        userId: user.id,
        companyId,
      },
      {
        onSuccess: (response) => {
          if (response.success && response.data) {
            setLinkToken(response.data.token);

            setCurrentStep('connecting');
          }
        },
        onError: () => {
          toast.error('Failed to create bank connection', {
            description: 'Please try again',
          });
        },
      },
    );
  };

  const connectAccount = async (publicToken: string, metadata?: any) => {
    if (!selectedProvider) {
      console.error('No provider selected');
      return;
    }

    // Set loading state immediately when connection starts
    setCurrentStep('connecting');

    connectAccountsMutation.mutate(
      {
        providerKey: selectedProvider.key,
        publicToken,
        metadata,
        userId: user?.id || '',
        companyId: companyId || '',
      },
      {
        onSuccess: (response) => {
          if (response.success && response.data) {
            setConnectedAccounts(response.data);
            const message = response?.message || 'Bank account connected successfully!';
            toast.success(message);
            if (companyType === 'individual') {
              setCurrentStep('success');
            } else {
              setCurrentStep('classify-accounts');
            }
          }
        },
        onError: (error: any) => {
          const errorData = error.response?.data?.error;
          const message = errorData?.displayMessage || errorData?.message || 'Connection failed';

          toast.error('Failed to connect bank account', {
            description: message,
          });
          // On error, go back to provider selection
          setCurrentStep('country-select');
        },
      },
    );
  };

  const handleProviderSelect = (provider: BankProvider) => {
    setSelectedProvider(provider);
    createLinkToken(provider);
  };

  const handleBackToCountrySelect = () => {
    setCurrentStep('country-select');
    setSelectionStrategy(null);
    setSelectedProvider(null);
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <WelcomeStep
            detectedCountry={detectedCountry}
            detectingLocation={detectingLocation}
            detectedCountryIsSupported={detectedCountryIsSupported}
            selectedCountry={selectedCountry}
            selectedCountryIsSupported={selectedCountryIsSupported}
            onContinue={handleWelcomeContinue}
            onChangeCountry={handleChangeCountry}
            stepWrapperClass={stepWrapperClass}
            onSkipToCSV={handleSkipToCSV}
            isLoading={createLinkTokenMutation.isPending}
          />
        );

      case 'country-select':
        return (
          <CountrySelectStep
            countryCategories={countryCategories}
            onCountrySelect={handleCountrySelect}
            onSkipToCSV={handleSkipToCSV}
            stepWrapperClass={stepWrapperClass}
          />
        );

      case 'provider-select':
        return selectionStrategy ? (
          <ProviderSelectStep
            selectionStrategy={selectionStrategy}
            selectedCountry={selectedCountry}
            selectedCountryIsSupported={selectedCountryIsSupported}
            onProviderSelect={handleProviderSelect}
            onBack={handleBackToCountrySelect}
            onSkipToCSV={handleSkipToCSV}
            stepWrapperClass={stepWrapperClass}
          />
        ) : null;

      case 'connecting':
        return selectedProvider && linkToken ? (
          <div className={stepWrapperClass}>
            {connectAccountsMutation.isPending ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 mr-2 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span className="text-lg font-semibold">Connecting your accounts...</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Please wait while we securely connect your bank accounts
                </div>
              </div>
            ) : (
              <ProviderWidget
                provider={selectedProvider.key}
                token={linkToken}
                onSuccess={connectAccount}
                onExit={() => setCurrentStep('provider-select')}
                onError={() => {
                  setCurrentStep('country-select');
                }}
                userId={user?.id}
                companyId={companyId}
              />
            )}
          </div>
        ) : (
          <div className={stepWrapperClass}>
            <div className="text-center space-y-4">
              <div className="text-lg font-semibold">
                {createLinkTokenMutation.isPending ? 'Creating connection...' : 'Loading...'}
              </div>
              <div className="text-sm text-muted-foreground">
                Please wait while we set up your connection
              </div>
            </div>
          </div>
        );

      case 'classify-accounts':
        return (
          <ClassifyAccountStep
            stepWrapperClass={stepWrapperClass}
            connectedAccounts={connectedAccounts}
            onComplete={navigateAway}
            onConnectAnother={() => setCurrentStep('country-select')}
            companyId={companyId || ''}
          />
        );

      case 'success':
        return (
          <div className={stepWrapperClass}>
            <div className="text-center space-y-4">
              <div className="text-lg font-semibold text-green-600">Success!</div>
              <div className="text-sm text-muted-foreground">
                Your bank account has been connected successfully. Transactions will start syncing
                shortly.
              </div>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Continue
              </Button>
            </div>
          </div>
        );

      default:
        return (
          <WelcomeStep
            detectedCountry={detectedCountry}
            detectingLocation={detectingLocation}
            detectedCountryIsSupported={detectedCountryIsSupported}
            selectedCountry={selectedCountry}
            selectedCountryIsSupported={selectedCountryIsSupported}
            onContinue={handleWelcomeContinue}
            onChangeCountry={handleChangeCountry}
            stepWrapperClass={stepWrapperClass}
            onSkipToCSV={handleSkipToCSV}
            isLoading={createLinkTokenMutation.isPending}
          />
        );
    }
  };

  if (sessionLoading) {
    return <CenteredLoader />;
  }

  if (!companyId || !user?.id) {
    return <ErrorPage type="default" />;
  }

  return (
    <div className="min-h-0 h-full p-4 pb-12 flex flex-col items-center justify-center">
      {renderCurrentStep()}
    </div>
  );
}
