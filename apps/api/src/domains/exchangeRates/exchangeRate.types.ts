import { z } from 'zod';

import { type SnakeToCamelCaseObject } from '../../shared/utils/formatting.utils.js';

// exchange_rate
export const newExchangeRate = z.object({
  rate_date: z.coerce.date(),
  base_currency_id: z.uuid(),
  price_currency_id: z.uuid(),
  rate: z.number(),
  source: z.enum(['seed', 'api', 'manual']),
  provider: z.string().trim().min(1).nullish(),
  provider_as_of: z.coerce.date().nullish(),
});
export const exchangeRateWithId = newExchangeRate.extend({
  id: z.uuid(),
});
export const exchangeRate = newExchangeRate.extend({
  id: z.uuid(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type ExchangeRateWithId = z.infer<typeof exchangeRateWithId>;
export type NewExchangeRateInput = z.infer<typeof newExchangeRate>;
export type ExchangeRate = z.infer<typeof exchangeRate>;

export interface ExchangeRateItem {
  date: string;
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: number;
}

export type ExchangeRateData = SnakeToCamelCaseObject<ExchangeRateWithId>;
