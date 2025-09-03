import { BankingProvider } from '../types/base.js';
import { PlaidProvider } from './plaid.provider.js';
import { MonoProvider } from './mono.provider.js';
import { getBankFeedProviders } from '../../../domains/bankFeedProviders/bankFeedProviders.model.js';

export class ProviderRegistry {
  private providers = new Map<string, BankingProvider>();
  private providerCountries = new Map<string, { id: string; code: string }[]>();
  private initialized = false;

  private async initializeProviders() {
    if (this.initialized) return;

    // Get enabled providers from database
    const response = await getBankFeedProviders({ useCache: true });

    if (!response.success) {
      console.warn(
        'Failed to fetch providers from database, falling back to environment variables',
      );
      this.fallbackToEnvironmentProviders();
      return;
    }

    const enabledProviderKeys = (response.data || [])
      .filter((provider) => provider.status === 'active')
      .map((provider) => provider.key);

    // Initialize provider instances and country mappings based on database configuration
    response.data?.forEach((providerData) => {
      const { key, countries } = providerData;

      if (enabledProviderKeys.includes(key)) {
        // Initialize provider instance
        if (key === 'plaid') {
          this.providers.set('plaid', new PlaidProvider());
        } else if (key === 'mono') {
          this.providers.set('mono', new MonoProvider());
        }

        // Store country mapping (both ID and code)
        this.providerCountries.set(key, countries);
      }
    });

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

  async get(key: string): Promise<BankingProvider | undefined> {
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
  async getProviderCountries(providerKey: string): Promise<{ id: string; code: string }[]> {
    await this.initializeProviders();
    return this.providerCountries.get(providerKey) || [];
  }

  /**
   * Force re-initialization of providers (useful when database is updated)
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    this.providers.clear();
    this.providerCountries.clear();
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
