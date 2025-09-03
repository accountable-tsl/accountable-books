import { useState, useMemo } from 'react';
import type { Country } from '@/shared/types/core';
import { useCountries } from '@/shared/hooks/useCountries';
import { getCountryFromLocale } from '@/shared/utils/random-utils';
import {
  categorizeCountries,
  isCountrySupported,
  type CountryCategories,
} from '../utils/country-operations';

export function useCountrySelection(supportedCountries: string[]) {
  const { data: countriesData, isLoading: detectingLocation } = useCountries();
  const [userSelectedCountry, setUserSelectedCountry] = useState<Country | null>(null);

  const countries = useMemo(() => countriesData?.data || [], [countriesData?.data]);

  const detectedCountry = useMemo(() => {
    return countriesData && countriesData?.data ? getCountryFromLocale(countriesData.data) : null;
  }, [countriesData]);

  const selectedCountry = userSelectedCountry || detectedCountry || null;

  const userInNG = useMemo(() => {
    return detectedCountry?.continent?.toLowerCase() === 'africa' || detectedCountry?.code === 'NG';
  }, [detectedCountry]);

  const countryCategories: CountryCategories = useMemo(() => {
    if (!countries.length) {
      return { popular: [], comingSoon: [], others: [] };
    }
    return categorizeCountries(countries, supportedCountries, userInNG);
  }, [countries, supportedCountries, userInNG]);

  const detectedCountryIsSupported = useMemo(() => {
    return isCountrySupported(detectedCountry?.code || '', supportedCountries);
  }, [detectedCountry?.code, supportedCountries]);

  const selectedCountryIsSupported = useMemo(() => {
    return isCountrySupported(selectedCountry?.code || '', supportedCountries);
  }, [selectedCountry?.code, supportedCountries]);

  return {
    countries,
    detectedCountry,
    selectedCountry,
    userSelectedCountry,
    setUserSelectedCountry,
    detectingLocation,
    userInNG,
    countryCategories,
    detectedCountryIsSupported,
    selectedCountryIsSupported,
  };
}
