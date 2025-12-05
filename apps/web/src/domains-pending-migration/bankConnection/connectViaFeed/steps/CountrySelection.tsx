import { CheckCircle, Globe, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCountries } from '@/shared/hooks/useCountries';
import type { Country } from '@/shared/types/core';
import { getCountryFromLocale } from '@/shared/utils/random-utils';

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
    <div className="flex-1 flex flex-col gap-6 p-4 min-h-0 max-h-full">
      <div className="text-center flex-shrink-0">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Globe className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-lg font-semibold">Select Your Country</h2>
        <p className="text-muted-foreground mx-auto text-sm">
          Select your country to find the best way to securely connect your bank
          account.
        </p>
      </div>

      {/* <div className="flex-1 min-h-0 overflow-y-auto"> */}
      {detectedCountry && (
        <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-600 rounded-lg p-4 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <MapPin className="w-5 h-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                We detected you're in{' '}
                <span className="font-semibold">{detectedCountry.name}</span>
              </p>
              <p className="hidden md:block text-sm text-muted-foreground">
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
            <div className="mt-3 text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-900 border border-amber-200 dark:border-amber-700 rounded p-2">
              Sorry, we don't support bank connections in {detectedCountry.name}{' '}
              yet.
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
        <div className="flex-shrink-0">
          <Label
            htmlFor="country-search"
            className="text-sm font-medium text-gray-700"
          >
            Country
          </Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
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

        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto scrollbar-thin-2px h-50">
          {searchTerm ? (
            <>
              {filteredCountries.map((country) => {
                const isSupported = isCountrySupported(country);
                return (
                  <div
                    key={country.code}
                    className={cn(
                      'cursor-pointer transition-all duration-200 border rounded-sm mr-1',
                      // If there's a valid country:
                      isSupported
                        ? selectedCountry?.code === country.code
                          ? // Selected
                            'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900'
                          : // Normal
                            ' hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-500'
                        : // Disabled
                          'bg-gray-50 opacity-60 cursor-not-allowed dark:bg-gray-800',
                    )}
                    onClick={() => isSupported && handleCountrySelect(country)}
                  >
                    <div className="flex items-center space-x-3 p-3">
                      <span className="text-lg">{country.flag}</span>
                      <div className="flex-1">
                        <span className="font-medium">{country.name}</span>
                      </div>
                      {selectedCountry?.code === country.code && (
                        <CheckCircle className="w-4 h-4 text-blue-600" />
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
                <div className="text-center py-8 text-muted-foreground">
                  No countries found matching your search.
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Popular Countries
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {popularCountries.map((country) => {
                  const isSupported = isCountrySupported(country);

                  return (
                    <div
                      key={country.code}
                      className={cn(
                        'cursor-pointer transition-all duration-200 border rounded-sm',
                        // for now everyone is disabled except NG
                        country.code !== 'NG'
                          ? 'bg-gray-50 opacity-60 cursor-not-allowed dark:bg-gray-800 pointer-events-none'
                          : '',
                        // If there's a valid country:
                        country
                          ? selectedCountry?.code === country.code
                            ? // Selected
                              'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900'
                            : // Normal
                              ' hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-500'
                          : // Disabled...
                            'bg-gray-50 opacity-60 cursor-not-allowed dark:bg-gray-800',
                      )}
                      onClick={() =>
                        isSupported && handleCountrySelect(country)
                      }
                    >
                      <div className="flex items-center space-x-3 p-3 rounded-xs">
                        <span className="text-lg">{country.flag}</span>
                        <div className="flex-1">
                          <span className="font-medium">{country.name}</span>
                        </div>
                        {selectedCountry?.code === country.code && (
                          <CheckCircle className="w-4 h-4 text-blue-600" />
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

      <div className="flex-shrink-0 flex justify-between">
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
          className="px-6 ml-auto"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// bg-amber-50
