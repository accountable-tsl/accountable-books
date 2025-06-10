import Decimal from "decimal.js";
import { fetchExchangeRate } from "./exchangeRates.model";

export async function determineExchangeRate(
  date: Date | string,
  fromCurrencyId: string,
  toCurrencyId: string
): Promise<Decimal | null> {
  try {
    if (fromCurrencyId === toCurrencyId) {
      return new Decimal(1);
    }

    const exr = await fetchExchangeRate(
      new Date(date as string),
      fromCurrencyId as string,
      toCurrencyId as string
    );

    if (exr.success && exr.data?.rate) {
      return new Decimal(exr.data.rate);
    } else {
      console.error(
        `Failed to determine exchange rate for ${fromCurrencyId} to ${toCurrencyId} on ${new Date(date).toLocaleDateString()}`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `Error determining exchange rate for ${fromCurrencyId} to ${toCurrencyId} on ${date}:`,
      error
    );
    return null;
  }
}
