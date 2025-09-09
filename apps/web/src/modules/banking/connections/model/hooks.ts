import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createLinkToken, connectAccounts } from '@/modules/banking/connections/api';
import { useState, useMemo } from 'react';
import type { Country } from '@/shared/types/core';
import { useCountries } from '@/shared/hooks/useCountries';
import { getCountryFromLocale } from '@/shared/utils/random-utils';
import {
  categorizeCountries,
  isCountrySupported,
  type CountryCategories,
} from '@/modules/banking/connections/utils/utils';
import { invalidateBankAccounts } from '@/modules/banking/accounts/model/hooks';
import {
  getProviderSelectionStrategy,
  getProvidersForCountry,
  getSupportedCountries,
} from '@/modules/banking/providers';

export const useCreateLinkToken = () => {
  return useMutation({
    mutationFn: createLinkToken,
    // onError: () => {
    //   toast.error('Failed to create bank connection', {
    //     description: 'Please try again',
    //   });
    // },
  });
};

export const useConnectAccounts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectAccounts,
    onSuccess: (_, variables) => {
      invalidateBankAccounts(queryClient, variables.companyId);
    },
  });
};

/**
 * Unified hook for all banking provider logic
 * Replaces: use-bank-providers, use-provider-status, and complex selection logic
 */
export function useBanking() {
  const supportedCountries = useMemo(() => getSupportedCountries(), []);

  const getProvidersFor = useMemo(
    () => (countryCode: string) => getProvidersForCountry(countryCode),
    [],
  );

  const getSelectionStrategy = useMemo(
    () => (countryCode: string) => getProviderSelectionStrategy(countryCode),
    [],
  );

  return {
    supportedCountries,
    getProvidersForCountry: getProvidersFor,
    getSelectionStrategy,
  };
}

/**
 * Hook for specific country context (optional convenience hook)
 */
export function useBankingForCountry(countryCode?: string) {
  const { supportedCountries, getProvidersForCountry, getSelectionStrategy } = useBanking();

  const providers = useMemo(
    () => (countryCode ? getProvidersForCountry(countryCode) : []),
    [countryCode, getProvidersForCountry],
  );

  const strategy = useMemo(
    () => (countryCode ? getSelectionStrategy(countryCode) : null),
    [countryCode, getSelectionStrategy],
  );

  const isSupported = useMemo(
    () => (countryCode ? supportedCountries.includes(countryCode) : false),
    [countryCode, supportedCountries],
  );

  return {
    providers,
    strategy,
    isSupported,
    supportedCountries,
  };
}

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
