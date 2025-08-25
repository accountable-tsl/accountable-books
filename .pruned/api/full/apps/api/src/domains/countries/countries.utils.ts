import { getCountryByCode } from './countries.model.js';

export async function getCountry(countryCode: string) {
  const result = await getCountryByCode(countryCode);
  if (!result.success || !result.data) {
    throw new Error(`Failed to get currency by code ${countryCode}: ${result.message}`);
  }

  return result.data;
}
