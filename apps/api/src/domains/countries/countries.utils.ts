import { getCountryByCode, getCountryById } from './countries.model.js';

export async function getCountryFromCode(countryCode: string) {
  const result = await getCountryByCode(countryCode);
  if (!result.success || !result.data) {
    throw new Error(
      `Failed to get country by code ${countryCode}: ${result.message}`,
    );
  }

  return result.data;
}

export async function getCountryFromId(id: string) {
  const result = await getCountryById(id);
  if (!result.success || !result.data) {
    throw new Error(`Failed to get country by id ${id}: ${result.message}`);
  }

  return result.data;
}
