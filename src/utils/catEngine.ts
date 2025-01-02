import { BankTransaction } from "../types/types";

export const detExchangeRate = (
  reportingCurrencyId: string,
  bankAccountCurrencyId: string
) => {
  //If reporting currency (id) equals bankAccount currency (id), ex rate = 1
  if (reportingCurrencyId === bankAccountCurrencyId) return 1;

  //Otherwise, check if rate exists on database for date, baseCurrencyId (reporting currency) and targetCurrencyId (bankAccount Currency)
  //If rates for both the above are not found and there is data for that currency pair after the date and the date is a weekend or a holiday, use last business day rate
  //Otherwise reach for the openexchangerates.org API (to be implemented later)
};


