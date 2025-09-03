import { Badge } from '@/components/ui/badge';
import { Globe } from 'lucide-react';
import { StepHeader } from '../step-header';
import { CountryListItem } from '../country-list-item';
import type { CountryCategories, CountryDisplay } from '../../utils/country-operations';

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
          <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin-2px">
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

        <div className="pt-4 border-t">
          <button
            onClick={onSkipToCSV}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            Skip and upload a CSV file instead
          </button>
        </div>
      </div>
    </div>
  );
}
