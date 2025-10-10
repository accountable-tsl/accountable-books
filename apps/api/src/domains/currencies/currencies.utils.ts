import { getCurrencyByCode } from './currencies.model.js';

export async function getCurrency(currencyCode: string) {
  const result = await getCurrencyByCode(currencyCode);
  if (!result.success || !result.data) {
    throw new Error(
      `Failed to get currency by code ${currencyCode}: ${result.message}`,
    );
  }

  return result.data;
}
