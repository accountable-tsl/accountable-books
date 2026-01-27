import type { Country } from '@/shared/types/core';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCountries } from '@/shared/hooks/useCountries';
import { getCountryFromLocale } from '@/shared/utils/random-utils';
import { CheckCircle, Globe, MapPin, Search } from 'lucide-react';
import { useNavigate } from 'react-router';

interface CountrySelectionProps {
  supportedCountries: Country[];
  onCountrySelect?: (country: Country) => void;
  onNext?: () => void;
  onBack?: () => void;
}
export default function CountrySelection({
  supportedCountries,
  onCountrySelect,
  onNext,
  onBack,
}: CountrySelectionProps) {
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  //   const [detectedCountry] = useState();

  // Hooks
  const { data: countriesData, isLoading: isLoadingCountries } = useCountries();
  const navigate = useNavigate();

  // Computed
  const countries = useMemo(
    () => countriesData?.data || [],
    [countriesData?.data],
  );
  const detectedCountry =
    countriesData &&
    countriesData?.data &&
    getCountryFromLocale(countriesData?.data);

  // const detectedCountryIsSupported = SUPPORTED_COUNTRIES_CODES.includes(
  //   detectedCountry?.code || ""
  // );
  const detectedCountryIsSupported = supportedCountries.some(
    (country) => country.code === detectedCountry?.code,
  );

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.code.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const isCountrySupported = (country: Country) =>
    supportedCountries.some((c) => c.code === country.code) ||
    supportedCountries.some((c) => c.id === country.id);

  const popularCountries = countries.filter((country) =>
    ['US', 'GB', 'NG', 'CA'].includes(country.code),
  );

  const handleCountrySelect = (country: Country) => {
    if (!isCountrySupported(country)) return;

    setSelectedCountry(country);
    onCountrySelect?.(country);
  };

  const handleUseDetected = () => {
    if (detectedCountry && isCountrySupported(detectedCountry)) {
      handleCountrySelect(detectedCountry);
    }
  };

  const handleCancel = () => {
    setSelectedCountry(null);
    if (onBack) {
      onBack?.();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // navigate(routes.catEngine.relativePath, { replace: true });
    }
  };

  const handleNext = () => {
    if (selectedCountry) {
      onNext?.();
    }
  };

  return (
    <div className="flex max-h-full min-h-0 flex-1 flex-col gap-6 p-4">
      <div className="flex-shrink-0 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <Globe className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="text-lg font-semibold">Select Your Country</h2>
        <p className="text-muted-foreground mx-auto text-sm">
          Select your country to find the best way to securely connect your bank
          account.
        </p>
      </div>

      {/* <div className="flex-1 min-h-0 overflow-y-auto"> */}
      {detectedCountry && (
        <div className="flex-shrink-0 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-slate-600 dark:bg-slate-800">
          <div className="flex items-center space-x-3">
            <MapPin className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                We detected you're in{' '}
                <span className="font-semibold">{detectedCountry.name}</span>
              </p>
              <p className="text-muted-foreground hidden text-sm md:block">
                You can change this if needed
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUseDetected}
              disabled={!detectedCountryIsSupported}
            >
              Use This
            </Button>
          </div>
          {!detectedCountryIsSupported && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
              Sorry, we don't support bank connections in {detectedCountry.name}{' '}
              yet.
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex-shrink-0">
          <Label
            htmlFor="country-search"
            className="text-sm font-medium text-gray-700"
          >
            Country
          </Label>
          <div className="relative mt-1">
            <Search className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
            <Input
              id="country-search"
              type="text"
              className="pl-10"
              placeholder="Search for your country..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="scrollbar-thin-2px flex h-50 min-h-0 flex-col gap-2 overflow-y-auto">
          {searchTerm ? (
            <>
              {filteredCountries.map((country) => {
                const isSupported = isCountrySupported(country);
                return (
                  <div
                    key={country.code}
                    className={cn(
                      'mr-1 cursor-pointer rounded-sm border transition-all duration-200',
                      // If there's a valid country:
                      isSupported
                        ? selectedCountry?.code === country.code
                          ? // Selected
                            'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900'
                          : // Normal
                            'hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-500'
                        : // Disabled
                          'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-gray-800',
                    )}
                    onClick={() => isSupported && handleCountrySelect(country)}
                  >
                    <div className="flex items-center space-x-3 p-3">
                      <span className="text-lg">{country.flag}</span>
                      <div className="flex-1">
                        <span className="font-medium">{country.name}</span>
                      </div>
                      {selectedCountry?.code === country.code && (
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                      )}
                      {!isSupported && (
                        <Badge variant="secondary" className="text-xs">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredCountries.length === 0 && (
                <div className="text-muted-foreground py-8 text-center">
                  No countries found matching your search.
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground mb-3 text-sm font-medium">
                Popular Countries
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {popularCountries.map((country) => {
                  const isSupported = isCountrySupported(country);

                  return (
                    <div
                      key={country.code}
                      className={cn(
                        'cursor-pointer rounded-sm border transition-all duration-200',
                        // for now everyone is disabled except NG
                        country.code !== 'NG'
                          ? 'pointer-events-none cursor-not-allowed bg-gray-50 opacity-60 dark:bg-gray-800'
                          : '',
                        // If there's a valid country:
                        country
                          ? selectedCountry?.code === country.code
                            ? // Selected
                              'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900'
                            : // Normal
                              'hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-500'
                          : // Disabled...
                            'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-gray-800',
                      )}
                      onClick={() =>
                        isSupported && handleCountrySelect(country)
                      }
                    >
                      <div className="flex items-center space-x-3 rounded-xs p-3">
                        <span className="text-lg">{country.flag}</span>
                        <div className="flex-1">
                          <span className="font-medium">{country.name}</span>
                        </div>
                        {selectedCountry?.code === country.code && (
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        )}
                        {!isSupported && (
                          <Badge variant="secondary" className="text-xs">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 justify-between">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleNext}
          disabled={
            !selectedCountry ||
            isLoadingCountries ||
            selectedCountry.code !== 'NG'
          } // TODO: Remove NG limit later
          className="ml-auto px-6"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// bg-amber-50
