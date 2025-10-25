import {
  getCurrencyByCodeModel,
  getCurrencyByIdModel,
} from './currencies.model.js';

export async function getCurrency(currencyCode: string) {
  const result = await getCurrencyByCodeModel(currencyCode);
  if (!result.success || !result.data) {
    throw new Error(
      `Failed to get currency by code ${currencyCode}: ${result.message}`,
    );
  }

  return result.data;
}

export async function getCurrencyById(id: string) {
  const result = await getCurrencyByIdModel(id);
  if (!result.success || !result.data) {
    throw new Error(`Failed to get currency by id ${id}: ${result.message}`);
  }

  return result.data;
}
