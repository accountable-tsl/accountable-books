import { fetchExchangeRate } from './exchangeRates.model.js';

export async function determineExchangeRate(
  date: Date | string,
  fromCurrencyId: string,
  toCurrencyId: string,
): Promise<number | null> {
  try {
    if (fromCurrencyId === toCurrencyId) {
      return Number(1);
    }

    const exr = await fetchExchangeRate(
      new Date(date as string),
      fromCurrencyId as string,
      toCurrencyId as string,
    );

    if (exr.success && exr.data?.rate) {
      return Number(exr.data.rate);
    } else {
      console.error(
        `Failed to determine exchange rate for ${fromCurrencyId} to ${toCurrencyId} on ${new Date(date).toLocaleDateString()}`,
      );
      return null;
    }
  } catch (error: unknown) {
    console.error(
      `Error determining exchange rate for ${fromCurrencyId} to ${toCurrencyId} on ${date}:`,
      error,
    );
    return null;
  }
}
