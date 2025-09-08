import { useState } from 'react';
import { useBanking } from '../hooks/use-banking';
import { useCountrySelection } from '../hooks/use-country-selection';
import { useConnectAccounts, useCreateLinkToken } from '@/features/banking/hooks/use-banking-api';
import { useSession } from '@/features/auth/Session';
import { WelcomeStep } from './steps/welcome-step';
import { CountrySelectStep } from './steps/country-select-step';
import { ProviderSelectStep } from './steps/provider-select-step';
import { ProviderWidget } from './provider-widget';
import { Button } from '@/components/ui/button';
import type { BankProvider, ProviderSelectionResult } from '../utils/providers';
import type { CountryDisplay } from '../utils/country-operations';
import { toast } from 'sonner';
import { CenteredLoader } from '@/components/CenteredLoader';
import ErrorPage from '@/components/ErrorPage';

type FlowStep =
  | 'welcome'
  | 'country-select'
  | 'provider-select'
  | 'connecting'
  | 'success'
  | 'csv-option';

export function BankConnectionFlow() {
  const [currentStep, setCurrentStep] = useState<FlowStep>('welcome');
  const [selectedProvider, setSelectedProvider] = useState<BankProvider | null>(null);
  const [selectionStrategy, setSelectionStrategy] = useState<ProviderSelectionResult | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const { user, companyId, loading: sessionLoading } = useSession();
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
      setCurrentStep('csv-option');
    }
  };

  const stepWrapperClass = 'min-w-md max-w-lg flex flex-col gap-6 mx-auto';

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
    setCurrentStep('csv-option');
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
          if (response.success) {
            setCurrentStep('success');
          }
        },
        onError: () => {
          // On error, go back to provider selection
          setCurrentStep('provider-select');
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
                  setCurrentStep('provider-select');
                }}
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
