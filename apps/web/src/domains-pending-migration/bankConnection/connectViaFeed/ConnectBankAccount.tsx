import React, { useCallback, useMemo, useState } from 'react';
import CountrySelection from '@/domains-pending-migration/bankConnection/connectViaFeed/steps/CountrySelection';
import { type UnsupportedCountryProps } from '@/domains-pending-migration/bankConnection/shared/types';
import { useBankFeedProviders } from '@/domains-pending-migration/bankFeedProviders/hooks';
import { type BankFeedProvider } from '@/domains-pending-migration/bankFeedProviders/types';
import { cn } from '@/lib/utils';
import { useCountries } from '@/shared/hooks/useCountries';
import { type Country } from '@/shared/types/core';
import { getErrorMessage } from '@/shared/utils/get-error-message';
import { useSession } from '@session';
import { Dot, EyeOff, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { handleMonoConnection } from '../widgets/api';
import { AccountLinked } from './steps/AccountLinked';
import { ProviderSelection } from './steps/ProviderSelection';
import { type ConnectBankAccountProps, type ConnectionResponse } from './types';

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
  const [_isLoading, setIsLoading] = useState(false);

  // Hooks
  const { companyId } = useSession();
  const { data: countriesData, isLoading: _isLoadingCountries } =
    useCountries();
  const { data: providersData, isLoading: _isLoadingProviders } =
    useBankFeedProviders({});

  const countries = useMemo(
    () => countriesData?.data || [],
    [countriesData?.data],
  );
  const providers = useMemo(
    () => providersData?.data || [],
    [providersData?.data],
  );

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
        toast.error(getErrorMessage(err, 'Failed to add bank account'));
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
    connections,
    handleWidgetSuccess,
    onSuccess,
  ]);

  // TODO: DANGLING CONNECTIONS YET TO MATCH TO BANK ACC

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-1 flex-col">
      <div className={cn('flex min-h-0 flex-1 flex-col', 'p-6', className)}>
        <div className={cn('min-h-0 flex-1 overflow-hidden', stepClassName)}>
          {stepContent}
        </div>
        <div className="shrink-0">
          <BankAccountFooter />
        </div>
      </div>
    </div>

    // </div>
  );
}

const BankAccountFooter = React.memo(() => (
  <footer className="flex shrink-0 flex-col items-center gap-1">
    <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
      <div className="flex items-center space-x-2">
        <Shield className="h-4 w-4 text-green-600" />
        <span>Bank-Level Security</span>
      </div>

      <div className="hidden lg:flex">
        <Dot />

        <div className="flex items-center space-x-2">
          <Lock className="h-4 w-4 text-green-600" />
          <span>256-bit Encryption</span>
        </div>

        <Dot />

        <div className="flex items-center space-x-2">
          <EyeOff className="h-4 w-4 text-green-600" />
          <span>Read-Only Access</span>
        </div>
      </div>
    </div>
    <p className="text-muted-foreground/60 text-center text-xs">
      Protected by bank-grade security, Powered by leading financial data
      providers.
    </p>
  </footer>
));
function UnsupportedCountry({ countryName, onBack }: UnsupportedCountryProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
          <i className="fas fa-globe text-2xl text-orange-600"></i>
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Country Not Yet Supported
        </h2>
        <p className="mb-8 text-gray-600">
          We don't support bank connections in{' '}
          <span className="font-semibold">{countryName}</span> yet, but we're
          working on it!
        </p>

        <div className="mb-8 rounded-lg border border-orange-200 bg-orange-50 p-6">
          <div className="flex items-start space-x-3">
            <i className="fas fa-info-circle mt-1 text-orange-600"></i>
            <div className="text-left">
              <h4 className="mb-2 font-medium text-gray-900">What's next?</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• We're actively expanding to new regions</li>
                <li>• Join our waitlist to be notified when available</li>
                <li>• Alternative payment methods may be available</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors duration-200 hover:bg-blue-700">
            <i className="fas fa-bell mr-2"></i>
            Join Waitlist
          </button>
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-50"
          >
            Select Different Country
          </button>
        </div>
      </div>
    </div>
  );
}
