import { describe, expect, it } from 'vitest';

import {
  getProviderSelectionStrategy,
  getProvidersForCountry,
  getSupportedCountries,
} from '../providers/utils/utils';

describe('Banking Integration', () => {
  describe('Core Provider Logic', () => {
    it('should return correct providers for supported countries', () => {
      expect(getProvidersForCountry('US')).toHaveLength(1);
      expect(getProvidersForCountry('US')[0].key).toBe('plaid');

      expect(getProvidersForCountry('NG')).toHaveLength(1);
      expect(getProvidersForCountry('NG')[0].key).toBe('mono');

      expect(getProvidersForCountry('XX')).toHaveLength(0);
    });

    it('should return correct selection strategies', () => {
      // US has one provider -> auto-direct
      const usStrategy = getProviderSelectionStrategy('US');
      expect(usStrategy.type).toBe('auto-direct');
      expect(usStrategy.provider?.key).toBe('plaid');

      // Nigeria has one provider -> auto-direct
      const ngStrategy = getProviderSelectionStrategy('NG');
      expect(ngStrategy.type).toBe('auto-direct');
      expect(ngStrategy.provider?.key).toBe('mono');

      // Unsupported country -> csv-fallback
      const unsupportedStrategy = getProviderSelectionStrategy('XX');
      expect(unsupportedStrategy.type).toBe('csv-fallback');
    });

    it('should return all supported countries', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('US');
      expect(countries).toContain('CA');
      expect(countries).toContain('NG');
      expect(countries.length).toBe(3);
    });
  });

  describe('Future Multi-Provider Scenarios', () => {
    it('should handle multiple providers correctly when uncommented', () => {
      // This test documents expected behavior when we add Teller
      // Currently, US only has Plaid, so it auto-directs
      // When we uncomment Teller in providers.ts, US will have 2 providers
      // and should switch to 'show-selection' strategy

      const usStrategy = getProviderSelectionStrategy('US');
      expect(usStrategy.type).toBe('auto-direct'); // Will become 'show-selection' with Teller
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty country code', () => {
      expect(getProvidersForCountry('')).toHaveLength(0);
    });

    it('should handle case sensitivity', () => {
      expect(getProvidersForCountry('us')).toHaveLength(0); // Should be uppercase
      expect(getProvidersForCountry('US')).toHaveLength(1);
    });
  });
});
