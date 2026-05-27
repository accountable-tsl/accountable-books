import type {
  CountryCategories,
  CountryDisplay,
} from '@/modules/banking/connections/utils/utils';
import { Badge } from '@/components/ui/badge';
import { CountryListItem } from '@/features/connect-bank/ui/components/country-list-item';
import { StepHeader } from '@/features/connect-bank/ui/components/step-header';
import { Globe } from 'lucide-react';

type CountrySelectStepProps = {
  countryCategories: CountryCategories;
  onCountrySelect: (country: CountryDisplay) => void;
  onSkipToCSV: () => void;
  stepWrapperClass: string;
};

export function CountrySelectStep({
  countryCategories,
  onCountrySelect,
  onSkipToCSV,
  stepWrapperClass,
}: CountrySelectStepProps) {
  return (
    <div className={stepWrapperClass}>
      <StepHeader
        Icon={Globe}
        title="Where are you located?"
        description="We'll show you banks available in your region"
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Popular regions</span>
          <Badge variant="secondary" className="text-xs">
            Supported
          </Badge>
        </div>

        <div className="space-y-2">
          {countryCategories.popular.map((country) => (
            <CountryListItem
              key={`${country.code}:${country.id}`}
              country={country}
              onClick={onCountrySelect}
            />
          ))}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Other regions</div>
          <div className="scrollbar-thin-2px max-h-40 space-y-2 overflow-y-auto">
            {countryCategories.comingSoon.map((country) => (
              <CountryListItem
                key={`${country.code}:${country.id}`}
                country={country}
                onClick={onCountrySelect}
              />
            ))}
            {countryCategories.others.map((country) => (
              <CountryListItem
                key={`${country.code}:${country.id}`}
                country={country}
                onClick={onCountrySelect}
              />
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <button
            onClick={onSkipToCSV}
            className="text-muted-foreground hover:text-foreground w-full text-center text-sm transition-colors"
          >
            Skip and upload a CSV file instead
          </button>
        </div>
      </div>
    </div>
  );
}
