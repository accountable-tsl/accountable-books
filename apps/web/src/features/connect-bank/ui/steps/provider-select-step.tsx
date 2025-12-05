import { ArrowLeft, Building } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProviderCard } from '@/features/connect-bank/ui/components/provider-card';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import type {
  BankProvider,
  ProviderSelectionResult,
} from '@/modules/banking/providers/model/types';
import type { Country } from '@/shared/types/core';

interface ProviderSelectStepProps {
  selectionStrategy: ProviderSelectionResult;
  selectedCountry: Country | null;
  onProviderSelect: (provider: BankProvider) => void;
  onBack: () => void;
  onSkipToCSV: () => void;
  stepWrapperClass: string;
  selectedCountryIsSupported?: boolean;
}

function getCountryDisplayName(country: Country | null): string {
  return country ? `${country.flag} ${country.name}` : '';
}

function getBankConnectionMessage(
  country: Country | null,
  isSupported: boolean,
): string {
  const countryDisplay = getCountryDisplayName(country);

  if (isSupported) {
    return `Bank connections are available for ${countryDisplay}, but you can still import your transactions.`;
  }

  return `Bank connections aren't available for ${countryDisplay} yet, but you can still import your transactions.`;
}

export function ProviderSelectStep({
  selectionStrategy,
  selectedCountry,
  onProviderSelect,
  onBack,
  onSkipToCSV,
  stepWrapperClass,
  selectedCountryIsSupported = false,
}: ProviderSelectStepProps) {
  // Handle the simple case: show selection with available providers
  if (
    selectionStrategy.type === 'show-selection' &&
    selectionStrategy.providers
  ) {
    return (
      <div className={stepWrapperClass}>
        <StepHeader
          Icon={Building}
          title="Choose your connection method"
          description={`Select how to connect your bank account in ${getCountryDisplayName(selectedCountry)}`}
        />

        <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin-2px">
          {selectionStrategy.providers.map((provider) => (
            <ProviderCard
              key={provider.key}
              provider={provider}
              onSelect={onProviderSelect}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <Button
            variant="link"
            size="sm"
            onClick={onSkipToCSV}
            className="text-muted-foreground hover:text-foreground p-0 h-auto"
          >
            Upload CSV instead
          </Button>
        </div>
      </div>
    );
  }

  // Fallback: No providers available, show CSV option
  return (
    <div className={stepWrapperClass}>
      <StepHeader
        Icon={Building}
        title="Connect your bank"
        description={
          selectedCountryIsSupported
            ? 'We have direct bank connections for your region'
            : "We don't have direct bank connections for your region yet"
        }
      />

      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm">
          {getBankConnectionMessage(
            selectedCountry,
            selectedCountryIsSupported,
          )}
        </p>

        <Button onClick={onSkipToCSV} className="w-full">
          Upload CSV file
        </Button>
      </div>

      <div className="flex justify-center pt-4 border-t">
        <Button
          variant="ghost"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to country selection
        </Button>
      </div>
    </div>
  );
}
