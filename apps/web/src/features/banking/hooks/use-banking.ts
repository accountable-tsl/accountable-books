import { useMemo } from 'react';
import {
  getProvidersForCountry,
  getProviderSelectionStrategy,
  getSupportedCountries,
  type BankProvider,
  type ProviderSelectionResult,
} from '../utils/providers';

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
