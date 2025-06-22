import { z } from "zod";
import { dbBaseFields } from "../../core/types/core";
import { SnakeToCamelCaseObject } from "../../shared/utils/formatting.utils";
import Decimal from "decimal.js";

// exchange_rate
export const newExchangeRate = z.object({
  date: z.coerce.date(),
  from_currency_id: z.string().uuid(),
  to_currency_id: z.string().uuid(),
  rate: z.number(),
});
export const exchangeRateWithId = newExchangeRate.extend({
  id: z.string().uuid(),
});
export const exchangeRate = newExchangeRate.merge(dbBaseFields);

export type ExchangeRateWithId = z.infer<typeof exchangeRateWithId>;
export type NewExchangeRateInput = z.infer<typeof newExchangeRate>;
export type ExchangeRate = z.infer<typeof exchangeRate>;

export interface ExchangeRateItem {
  date: Date;
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: number;
}

export type ExchangeRateData = SnakeToCamelCaseObject<ExchangeRateWithId>;
