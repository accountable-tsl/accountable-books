import { Button } from '@/components/ui/button';
import { ArrowRight, Loader, MapPin, Shield } from 'lucide-react';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import { TrustIndicators } from '@/features/connect-bank/ui/components/trust-signals';
import type { Country } from '@/shared/types/core';

type WelcomeStepProps = {
  detectedCountry: Country | null | undefined;
  detectingLocation: boolean;
  detectedCountryIsSupported: boolean;
  selectedCountry: Country | null | undefined;
  selectedCountryIsSupported: boolean;
  onContinue: () => void;
  onChangeCountry: () => void;
  stepWrapperClass: string;
  onSkipToCSV: () => void;
  isLoading?: boolean;
};

export function WelcomeStep({
  detectedCountry,
  detectingLocation,
  detectedCountryIsSupported,
  selectedCountry,
  selectedCountryIsSupported,
  onContinue,
  onChangeCountry,
  stepWrapperClass,
  onSkipToCSV,
  isLoading = false,
}: WelcomeStepProps) {
  return (
    <div className={stepWrapperClass}>
      <StepHeader
        Icon={Shield}
        title="Connect your bank account"
        description="Securely link your account. Your data is encrypted and transmitted securely"
      />

      {/* Location detection indicator */}
      {detectingLocation && (
        <div className="p-4 rounded-md bg-blue-50 dark:bg-muted">
          <div className="flex items-center gap-3">
            <Loader className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
            <div className="text-sm">
              <span className="font-medium text-blue-900 dark:text-blue-100">
                Detecting your location...
              </span>
              <p className="text-blue-700 dark:text-blue-300">
                We'll show you relevant banks in your area
              </p>
            </div>
          </div>
        </div>
      )}

      {detectedCountry && !detectingLocation && (
        <div
          className={`p-4 rounded-md ${
            detectedCountryIsSupported
              ? 'bg-green-50 border-green-200 dark:bg-muted'
              : 'bg-yellow-50 border-yellow-200 dark:bg-muted'
          }`}
        >
          <div className="flex items-center gap-3">
            <MapPin
              className={`w-4 h-4 ${
                detectedCountryIsSupported
                  ? 'text-green-600 dark:text-emerald-500'
                  : 'text-yellow-600 dark:text-yellow-500'
              }`}
            />
            <div className="flex-1 text-sm">
              <span
                className={`font-medium ${
                  detectedCountryIsSupported
                    ? 'text-green-900 dark:text-emerald-400'
                    : 'text-yellow-900 dark:text-yellow-400'
                }`}
              >
                {detectedCountry?.flag} Detected: {detectedCountry?.name}
              </span>
              <p
                className={`${
                  detectedCountryIsSupported
                    ? 'text-green-700 dark:text-emerald-600'
                    : 'text-yellow-700 dark:text-yellow-600'
                }`}
              >
                {detectedCountryIsSupported
                  ? 'Bank connections are available in your region!'
                  : "We're working on adding support for your region"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onChangeCountry}
              className={`font-normal ${
                detectedCountryIsSupported
                  ? 'text-green-700 dark:text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-400 dark:border-1 dark:border-muted dark:hover:border-emerald-900'
                  : 'text-yellow-700 dark:text-yellow-600 hover:text-yellow-800 dark:hover:text-yellow-400 dark:border-1 dark:border-muted dark:hover:border-yellow-900'
              }`}
            >
              Change
            </Button>
          </div>
        </div>
      )}

      <TrustIndicators />

      <Button className="w-full" disabled={detectingLocation || isLoading} onClick={onContinue}>
        {selectedCountry && selectedCountryIsSupported
          ? 'Connect your bank'
          : 'Choose a different country'}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>

      <div className="text-center">
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onSkipToCSV}
        >
          Prefer to upload a file instead?
        </button>
      </div>
    </div>
  );
}
