import { useCountries } from '@/shared/hooks/useCountries';
import React, { useCallback, useMemo, useState } from 'react';
import CountrySelection from '@/domains-pending-migration/bankConnection/connectViaFeed/steps/CountrySelection';
import { type Country } from '@/shared/types/core';
import { Dot, EyeOff, Lock, Shield } from 'lucide-react';
import { ProviderSelection } from './steps/ProviderSelection';
import { type BankFeedProvider } from '@/domains-pending-migration/bankFeedProviders/types';
import { useBankFeedProviders } from '@/domains-pending-migration/bankFeedProviders/hooks';
import { type UnsupportedCountryProps } from '@/domains-pending-migration/bankConnection/shared/types';
import { type ConnectBankAccountProps, type ConnectionResponse } from './types';
import { cn } from '@/lib/utils';
import { AccountLinked } from './steps/AccountLinked';
import { handleMonoConnection } from '../widgets/api';
import { toast } from 'sonner';
import { useSession } from '@session';

export default function ConnectBankAccount({
  onSuccess,
  options,
}: ConnectBankAccountProps) {
  // States
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<BankFeedProvider | null>(null);
  const [showUnsupported, setShowUnsupported] = useState(false);
  // const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Hooks
  const { companyId, refetchSession } = useSession();
  const { data: countriesData, isLoading: isLoadingCountries } = useCountries();
  const { data: providersData, isLoading: isLoadingProviders } =
    useBankFeedProviders({});

  const countries = countriesData?.data || [];
  const providers = providersData?.data || [];

  const { className, stepClassName } = options || {};

  // Functions
  const supportedCountries = useMemo(() => {
    return countries.filter((country) =>
      providers.some((provider) =>
        provider.countries.some((c) => c.code === country.code),
      ),
    );
  }, [countries, providers]);

  const providersForCountry = useCallback(
    (country: Country) =>
      providers.filter((provider) =>
        provider.countries.some((c) => c.code === country.code),
      ),
    [providers],
  );

  const countryIsSupported = useCallback(
    (country: Country) =>
      providers.some((provider) =>
        provider.countries.some((c) => c.code === country.code),
      ),
    [providers],
  );

  const handleCountrySelect = useCallback(
    (country: Country) => {
      setSelectedCountry(country);
      setShowUnsupported(!countryIsSupported(country));
    },
    [countryIsSupported],
  );

  const handleProviderSelect = useCallback((provider: BankFeedProvider) => {
    setSelectedProvider(provider);
  }, []);

  const handleWidgetSuccess = useCallback(
    async (code: string) => {
      if (!selectedProvider || !companyId || !code) {
        toast.error('Failed to add bank account. Please try again.');
        setCurrentStep(1);
        return;
      }

      const storageKey = 'tempBankConnectPayload';
      const payload = {
        providerKey: selectedProvider.key,
        companyId,
        code,
        timeStamp: Date.now(),
      };
      // TODO: TO REMOVE <Quickly save code to local storage for now>
      localStorage.setItem(storageKey, JSON.stringify(payload));

      const attemptRequest = async () => {
        switch (payload.providerKey) {
          case 'mono':
            return await handleMonoConnection({
              companyId: payload.companyId,
              data: { code: payload.code },
            });
          default:
            throw new Error('Unsupported provider');
          // Should we be throwing here? Won't it break the app
        }
      };

      try {
        setIsLoading(true);

        let result;

        result = await attemptRequest();

        if (!result.success || !result.data) {
          await new Promise((res) => setTimeout(res, 1000));
          result = await attemptRequest();
        }

        if (!result.success || !result.data) {
          throw new Error(
            result.message || 'Failed to add bank account, please try again.',
          );
        }

        setConnections(result.data.connections || []);
        setCurrentStep(3);
      } catch (err: unknown) {
        const fallbackMsg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to add bank account';
        toast.error(fallbackMsg);
        setCurrentStep(1);
      } finally {
        localStorage.removeItem(storageKey);
        setIsLoading(false);
      }
    },
    [selectedProvider, companyId],
  );

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => (prev < 4 ? prev + 1 : prev));
  }, []);

  const backStep = useCallback(() => {
    setCurrentStep((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  const resetToCountrySelection = useCallback(() => {
    setCurrentStep(1);
    setSelectedCountry(null);
    // setSelectedProvider(null);
    setShowUnsupported(false);
  }, []);

  const stepContent = useMemo(() => {
    if (showUnsupported) {
      return (
        <UnsupportedCountry
          countryName={selectedCountry?.name || 'this country'}
          onBack={resetToCountrySelection}
        />
      );
    }

    return (
      <>
        {currentStep === 1 && (
          <CountrySelection
            supportedCountries={supportedCountries}
            onCountrySelect={handleCountrySelect}
            onNext={nextStep}
          />
        )}
        {currentStep === 2 &&
          selectedCountry && ( //
            <ProviderSelection
              key={`provider-${selectedCountry.id}`}
              selectedCountry={selectedCountry}
              providers={providersForCountry(selectedCountry)}
              onWidgetSuccess={handleWidgetSuccess}
              onProviderSelect={handleProviderSelect}
              onNext={nextStep}
              onBack={backStep}
            />
          )}

        {currentStep === 3 && (
          <AccountLinked
            connections={connections}
            handleDone={onSuccess}
            reset={resetToCountrySelection}
            // connections={sampleConnections}
          />
        )}
      </>
    );
  }, [
    showUnsupported,
    selectedCountry,
    currentStep,
    supportedCountries,
    providersForCountry,
    handleCountrySelect,
    nextStep,
    backStep,
    resetToCountrySelection,
    handleProviderSelect,
  ]);

  // TODO: DANGLING CONNECTIONS YET TO MATCH TO BANK ACC

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full max-w-3xl mx-auto">
      <div className={cn('flex flex-col flex-1 min-h-0', 'p-6', className)}>
        <div className={cn('min-h-0 overflow-hidden flex-1', stepClassName)}>
          {stepContent}
        </div>
        <div className="flex-shrink-0">
          <BankAccountFooter />
        </div>
      </div>
    </div>

    // </div>
  );
}

const BankAccountFooter = React.memo(() => (
  <footer className="flex-shrink-0 flex flex-col gap-1 items-center">
    <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
      <div className="flex items-center space-x-2">
        <Shield className="w-4 h-4 text-green-600" />
        <span>Bank-Level Security</span>
      </div>

      <div className="hidden lg:flex">
        <Dot />

        <div className="flex items-center space-x-2">
          <Lock className="w-4 h-4 text-green-600" />
          <span>256-bit Encryption</span>
        </div>

        <Dot />

        <div className="flex items-center space-x-2">
          <EyeOff className="w-4 h-4 text-green-600" />
          <span>Read-Only Access</span>
        </div>
      </div>
    </div>
    <p className="text-xs text-muted-foreground/60 text-center">
      Protected by bank-grade security, Powered by leading financial data
      providers.
    </p>
  </footer>
));
function UnsupportedCountry({ countryName, onBack }: UnsupportedCountryProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <i className="fas fa-globe text-orange-600 text-2xl"></i>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Country Not Yet Supported
        </h2>
        <p className="text-gray-600 mb-8">
          We don't support bank connections in{' '}
          <span className="font-semibold">{countryName}</span> yet, but we're
          working on it!
        </p>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-8">
          <div className="flex items-start space-x-3">
            <i className="fas fa-info-circle text-orange-600 mt-1"></i>
            <div className="text-left">
              <h4 className="font-medium text-gray-900 mb-2">What's next?</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• We're actively expanding to new regions</li>
                <li>• Join our waitlist to be notified when available</li>
                <li>• Alternative payment methods may be available</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors duration-200">
            <i className="fas fa-bell mr-2"></i>
            Join Waitlist
          </button>
          <button
            onClick={onBack}
            className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
          >
            Select Different Country
          </button>
        </div>
      </div>
    </div>
  );
}
