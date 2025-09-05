import { BankingProvider } from '../types/base.js';
import { PlaidProvider } from './plaid.provider.js';
import { MonoProvider } from './mono.provider.js';
import { getBankFeedProviders } from '../../../domains/bankFeedProviders/bankFeedProviders.model.js';
import type {
  BankFeedProviderWithCountries,
  BankProviderKey,
} from 'src/domains/bankFeedProviders/bankFeedProviders.types.js';

export class ProviderRegistry {
  private providers = new Map<BankProviderKey, BankingProvider>();
  private providerCountries = new Map<BankProviderKey, { id: string; code: string }[]>();
  private providerIds = new Map<BankProviderKey, string>();
  private enabledProviders = new Map<BankProviderKey, BankFeedProviderWithCountries>();
  private initialized = false;

  private async initializeProviders() {
    if (this.initialized) return;

    // Get enabled providers from database
    const response = await getBankFeedProviders({ useCache: true });

    if (!response.success || !response.data) {
      console.warn(
        'Failed to fetch providers from database, falling back to environment variables',
      );
      // TODO: Decide whether to return, throw error or fallback
      // this.fallbackToEnvironmentProviders();
      return;
    }

    // Initialize provider instances and country mappings based on database configuration
    for (const provider of response.data) {
      if (provider.status !== 'active') continue;

      const { key, countries, id } = provider;

      // Store the provider in enabledProviders
      this.enabledProviders.set(key, provider);

      // Initialize provider instance if not already done
      if (!this.providers.has(key)) {
        if (key === 'plaid') {
          this.providers.set('plaid', new PlaidProvider());
        } else if (key === 'mono') {
          this.providers.set('mono', new MonoProvider());
        }
      }

      // Store country mapping
      this.providerCountries.set(key, countries);

      // Store provider ID
      this.providerIds.set(key, id);
    }

    // response.data?.forEach((providerData) => {
    //   const { key, countries } = providerData;

    //   if (enabledProviderKeys.includes(key)) {
    //     // Initialize provider instance
    //     if (key === 'plaid') {
    //       this.providers.set('plaid', new PlaidProvider());
    //     } else if (key === 'mono') {
    //       this.providers.set('mono', new MonoProvider());
    //     }

    //     // Store country mapping (both ID and code)
    //     this.providerCountries.set(key, countries);
    //     this.providerIds.set(key, providerData.id);
    //   }
    // });

    this.initialized = true;
  }

  private fallbackToEnvironmentProviders() {
    const enabledProviders = ['plaid', 'mono'];

    if (enabledProviders.includes('plaid')) {
      this.providers.set('plaid', new PlaidProvider());
      // Fallback to hardcoded countries when database is unavailable
      this.providerCountries.set('plaid', [
        { id: 'us-country-id', code: 'US' },
        { id: 'ca-country-id', code: 'CA' },
      ]);
    }

    if (enabledProviders.includes('mono')) {
      this.providers.set('mono', new MonoProvider());
      // Fallback to hardcoded countries when database is unavailable
      this.providerCountries.set('mono', [{ id: 'ng-country-id', code: 'NG' }]);
    }

    this.initialized = true;
  }

  async get(key: BankProviderKey): Promise<BankingProvider | undefined> {
    await this.initializeProviders();
    return this.providers.get(key);
  }

  async getAll(): Promise<BankingProvider[]> {
    await this.initializeProviders();
    return Array.from(this.providers.values());
  }

  async getForCountry(countryCode: string): Promise<BankingProvider[]> {
    await this.initializeProviders();
    const matchingProviders: BankingProvider[] = [];

    for (const [providerKey, provider] of this.providers.entries()) {
      const countries = this.providerCountries.get(providerKey) || [];
      if (countries.some((country) => country.code === countryCode)) {
        matchingProviders.push(provider);
      }
    }

    return matchingProviders;
  }

  async getSupportedCountries(): Promise<string[]> {
    await this.initializeProviders();
    const allCountries: string[] = [];

    for (const countries of this.providerCountries.values()) {
      allCountries.push(...countries.map((country) => country.code));
    }

    return Array.from(new Set(allCountries));
  }

  /**
   * Get full country details (including IDs) for a provider
   */
  async getProviderCountries(
    providerKey: BankProviderKey,
  ): Promise<{ id: string; code: string }[]> {
    await this.initializeProviders();
    return this.providerCountries.get(providerKey) || [];
  }

  async getProviderId(providerKey: BankProviderKey): Promise<string | undefined> {
    await this.initializeProviders();
    return this.providerIds.get(providerKey);
  }

  async getEnabledProvider(
    providerKey: BankProviderKey,
  ): Promise<BankFeedProviderWithCountries | undefined> {
    await this.initializeProviders();
    return this.enabledProviders.get(providerKey);
  }
  /**
   * Force re-initialization of providers (useful when database is updated)
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    this.providers.clear();
    this.providerCountries.clear();
    this.providerIds.clear();
    await this.initializeProviders();
  }
}

/**
 * Helper function to refresh the provider registry when providers are updated
 * Should be called after any database changes to bank_feed_providers
 */
export async function refreshProviderRegistry(): Promise<void> {
  await providerRegistry.refresh();
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();
