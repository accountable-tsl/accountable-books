import z from "zod";

export const bankProviderKey = z.enum(['plaid', 'mono']); // stripe, teller, enable_banking, yodlee, etc.
export type BankProviderKey = z.infer<typeof bankProviderKey>;
export interface BankProvider {
  id: string;
  key: BankProviderKey;
  name: string;
  logo: string;
  countries: string[];
}

export interface ProviderSelectionResult {
  type: 'auto-direct' | 'show-selection' | 'csv-fallback';
  provider?: BankProvider;
  providers?: BankProvider[];
}

// Simple provider data - no fake metadata
export const BANK_PROVIDERS: BankProvider[] = [
  {
    id: 'plaid-1',
    key: 'plaid',
    name: 'Plaid',
    logo: 'https://i.postimg.cc/RFsVZfng/plaid.png',
    countries: ['US', 'CA'],
  },
  {
    id: 'mono-1',
    key: 'mono',
    name: 'Mono',
    logo: 'https://i.postimg.cc/bNMg2Bhh/mono.png',
    countries: ['NG'],
  },
  // Future providers - uncomment when needed:
  // {
  //   id: 'teller-1',
  //   key: 'teller',
  //   name: 'Teller',
  //   logo: '/teller-logo.png',
  //   countries: ['US'],
  // },
];

/**
 * Gets providers available for a specific country
 */
export function getProvidersForCountry(countryCode: string): BankProvider[] {
  return BANK_PROVIDERS.filter((provider) => provider.countries.includes(countryCode));
}

/**
 * Determines the selection strategy based on available providers
 */
export function getProviderSelectionStrategy(countryCode: string): ProviderSelectionResult {
  const providers = getProvidersForCountry(countryCode);

  if (providers.length === 0) {
    return { type: 'csv-fallback' };
  }

  if (providers.length === 1) {
    return { type: 'auto-direct', provider: providers[0] };
  }

  return { type: 'show-selection', providers };
}

/**
 * Gets all supported countries from all providers
 */
export function getSupportedCountries(): string[] {
  return Array.from(new Set(BANK_PROVIDERS.flatMap((provider) => provider.countries)));
}
