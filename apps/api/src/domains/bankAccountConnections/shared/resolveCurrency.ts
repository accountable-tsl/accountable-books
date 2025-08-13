import type { Knex } from "knex";
import { AppError } from "../../../shared/utils/response.utils.js";
import { getCurrencyByCode } from "../../currencies/currencies.model.js";

export async function resolveCurrency({
  currencyCode,
  trx,
}: {
  currencyCode: string;
  trx?: Knex.Transaction;
}) {
  const result = await getCurrencyByCode(currencyCode);

  if (!result.success || !result.data) {
    throw new AppError("Currency resolution failed", {
      currencyCode,
    });
  }

  return { currency: result.data };
}
