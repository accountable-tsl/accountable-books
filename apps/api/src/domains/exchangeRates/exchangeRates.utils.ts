import type { Knex } from 'knex';

import { createChildLogger } from '../../shared/utils/logger.js';
import { fetchExchangeRate } from './exchangeRates.model.js';

const fxLogger = createChildLogger({ domain: 'exchange_rates' });

export async function determineExchangeRate({
  date,
  fromCurrencyId,
  toCurrencyId,
  trx,
}: {
  date: Date | string;
  fromCurrencyId: string;
  toCurrencyId: string;
  trx?: Knex.Transaction;
}): Promise<number | null> {
  try {
    if (fromCurrencyId === toCurrencyId) {
      return Number(1);
    }

    const exr = await fetchExchangeRate(
      date,
      fromCurrencyId as string,
      toCurrencyId as string,
      trx,
    );

    if (exr.success && exr.data?.rate) {
      return Number(exr.data.rate);
    } else {
      fxLogger.warn(
        {
          fromCurrencyId,
          toCurrencyId,
          date: new Date(date).toISOString(),
          error: exr.error,
        },
        'Failed to determine exchange rate',
      );
      return null;
    }
  } catch (error: unknown) {
    fxLogger.error(
      {
        fromCurrencyId,
        toCurrencyId,
        date: new Date(date).toISOString(),
        error,
      },
      'Unexpected error determining exchange rate',
    );
    return null;
  }
}
