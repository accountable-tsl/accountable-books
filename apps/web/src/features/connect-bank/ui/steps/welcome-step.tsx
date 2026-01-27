import type { Country } from '@/shared/types/core';
import { Button } from '@/components/ui/button';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import { TrustIndicators } from '@/features/connect-bank/ui/components/trust-signals';
import { ArrowRight, Loader, MapPin, Shield } from 'lucide-react';

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
        <div className="dark:bg-muted rounded-md bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Loader className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
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
          className={`rounded-md p-4 ${
            detectedCountryIsSupported
              ? 'dark:bg-muted border-green-200 bg-green-50'
              : 'dark:bg-muted border-yellow-200 bg-yellow-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <MapPin
              className={`h-4 w-4 ${
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
                  ? 'dark:border-muted text-green-700 hover:text-emerald-800 dark:border-1 dark:text-emerald-600 dark:hover:border-emerald-900 dark:hover:text-emerald-400'
                  : 'dark:border-muted text-yellow-700 hover:text-yellow-800 dark:border-1 dark:text-yellow-600 dark:hover:border-yellow-900 dark:hover:text-yellow-400'
              }`}
            >
              Change
            </Button>
          </div>
        </div>
      )}

      <TrustIndicators />

      <Button
        className="w-full"
        disabled={detectingLocation || isLoading}
        onClick={onContinue}
      >
        {selectedCountry && selectedCountryIsSupported
          ? 'Connect your bank'
          : 'Choose a different country'}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <div className="text-center">
        <button
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          onClick={onSkipToCSV}
        >
          Prefer to upload a file instead?
        </button>
      </div>
    </div>
  );
}
