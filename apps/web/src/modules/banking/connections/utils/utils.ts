import type { Country } from '@/shared/types/core';

export type CountryDisplay = {
  id?: string;
  code: string;
  name?: string;
  flag: string;
  isSupported: boolean;
};

export type CountryCategories = {
  popular: CountryDisplay[];
  comingSoon: CountryDisplay[];
  others: CountryDisplay[];
};

export function createCountryLookup(
  countries: Country[],
): Map<string, Country> {
  return new Map(countries.map((country) => [country.code, country]));
}

export function isCountrySupported(
  countryCode: string,
  supportedCountries: string[],
): boolean {
  return supportedCountries.includes(countryCode);
}

export function getPopularCountries(userInNG: boolean): string[] {
  return userInNG ? ['US', 'NG'] : ['US', 'CA'];
}

export function getComingSoonCountries(
  userInNG: boolean,
  popularCountries: string[],
): string[] {
  const allComingSoon = userInNG
    ? ['GB', 'AU', 'DE', 'NG', 'FR']
    : ['GB', 'AU', 'FR'];
  // Remove countries that are already in popular to avoid duplication
  return allComingSoon.filter((code) => !popularCountries.includes(code));
}

export function createCountryDisplay(
  countryCode: string,
  countryLookup: Map<string, Country>,
  supportedCountries: string[],
): CountryDisplay | null {
  const country = countryLookup.get(countryCode);
  if (!country) return null;

  return {
    id: country.id,
    code: countryCode,
    name: country.name,
    flag: country.flag || '',
    isSupported: isCountrySupported(countryCode, supportedCountries),
  };
}

export function categorizeCountries(
  countries: Country[],
  supportedCountries: string[],
  userInNG: boolean,
): CountryCategories {
  const countryLookup = createCountryLookup(countries);
  const suggestedPopular = getPopularCountries(userInNG);
  const suggestedComingSoon = getComingSoonCountries(
    userInNG,
    suggestedPopular,
  );

  // Only include supported countries in popular, move unsupported ones to coming soon
  const popular = suggestedPopular
    .filter((code) => isCountrySupported(code, supportedCountries))
    .map((code) =>
      createCountryDisplay(code, countryLookup, supportedCountries),
    )
    .filter((country): country is CountryDisplay => country !== null);

  // Add unsupported countries from suggested popular to coming soon
  const unsupportedFromPopular = suggestedPopular.filter(
    (code) => !isCountrySupported(code, supportedCountries),
  );

  // Combine suggested coming soon with unsupported from popular
  const allComingSoon = [...suggestedComingSoon, ...unsupportedFromPopular];
  const comingSoon = allComingSoon
    .map((code) =>
      createCountryDisplay(code, countryLookup, supportedCountries),
    )
    .filter((country): country is CountryDisplay => country !== null);

  // Track all codes already categorized
  const usedCodes = new Set([
    ...popular.map((c) => c.code),
    ...comingSoon.map((c) => c.code),
  ]);

  // Add remaining supported countries to others (ensure all supported countries are visible)
  const remainingSupportedCountries = supportedCountries
    .filter((code) => !usedCodes.has(code))
    .map((code) =>
      createCountryDisplay(code, countryLookup, supportedCountries),
    )
    .filter((country): country is CountryDisplay => country !== null);

  // Add other unsupported countries
  const remainingUnsupportedCountries = countries
    .filter(
      (country) =>
        !usedCodes.has(country.code) &&
        !supportedCountries.includes(country.code),
    )
    .slice(0, Math.max(0, 10 - remainingSupportedCountries.length)) // Fill up to 10 total, prioritizing supported
    .map((country) =>
      createCountryDisplay(country.code, countryLookup, supportedCountries),
    )
    .filter((country): country is CountryDisplay => country !== null);

  // Combine remaining countries, with supported countries first
  const others = [
    ...remainingSupportedCountries,
    ...remainingUnsupportedCountries,
  ];

  return { popular, comingSoon, others };
}
