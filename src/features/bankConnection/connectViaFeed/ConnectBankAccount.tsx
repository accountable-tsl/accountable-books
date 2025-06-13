import { useCountries } from "@/shared/hooks/useCountries";
import { useState } from "react";
import CountrySelection from "@/features/bankConnection/connectViaFeed/steps/CountrySelection";
import { Country } from "@/shared/types/core";
import { EyeOff, Lock, Shield } from "lucide-react";
import ProviderSelection from "./steps/ProviderSelection";
import { BankFeedProvider } from "@/domains/bankFeedProviders/types";
import { useBankFeedProviders } from "@/domains/bankFeedProviders/hooks";
import { UnsupportedCountryProps } from "@/features/bankConnection/shared/types";

export default function ConnectBankAccount() {
  // States
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<BankFeedProvider | null>(null);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [showUnsupported, setShowUnsupported] = useState(false);

  // Hooks
  const { data: countriesData, isLoading: isLoadingCountries } = useCountries();
  const { data: providersData, isLoading: isLoadingProviders } =
    useBankFeedProviders({});

  const countries = countriesData?.data || [];
  const providers = providersData?.data || [];

  // Functions

  const providersForCountry = (country: Country) =>
    providers.filter((provider) =>
      provider.countries.some((c) => c.code === country.code)
    );

  const supportedCountries = countries.filter((country) =>
    providers.some((provider) =>
      provider.countries.some((c) => c.code === country.code)
    )
  );

  const countryIsSupported = (country: Country) =>
    providers.some((provider) =>
      provider.countries.some((c) => c.code === country.code)
    );




  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    if (!countryIsSupported(country)) {
      setShowUnsupported(true);
      return;
    }

    setShowUnsupported(false);
  };

  const handleProviderSelect = (provider: BankFeedProvider) => {
    setSelectedProvider(provider);
  };

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const backStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const resetToCountrySelection = () => {
    setCurrentStep(1);
    setSelectedCountry(null);
    setSelectedProvider(null);
    setSelectedBank(null);
    setShowUnsupported(false);
  };

  return (
    <div>
      {showUnsupported ? (
        <UnsupportedCountry
          countryName={selectedCountry?.name || "this country"}
          onBack={resetToCountrySelection}
        />
      ) : (
        <>
          <div className="max-w-2xl mx-auto">
            <div className="p-8">
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
                    selectedCountry={selectedCountry}
                    providers={providersForCountry(selectedCountry)}
                    onProviderSelect={handleProviderSelect}
                    onNext={nextStep}
                    onBack={backStep}
                  />
                )}
            </div>
          </div>
        </>
      )}
      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center">
        <div className="flex items-center justify-center space-x-8 text-sm text-gray-500 mb-4">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-green-600" />
            <span>Bank-Level Security</span>
          </div>
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-green-600" />
            <span>256-bit Encryption</span>
          </div>
          <div className="flex items-center space-x-2">
            <EyeOff className="w-4 h-4 text-green-600" />
            <span>Read-Only Access</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Protected by bank-grade security, Powered by leading financial data
          providers. We do not have access to your authorization details.
        </p>
      </footer>
    </div>
  );
}

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
          We don't support bank connections in{" "}
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
