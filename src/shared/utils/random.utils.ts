import type { Knex } from "knex";
import { getCompanyIdentifiers } from "../../domains/companies/companies.utils";

export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const getCompanyUUID = async (
  identifier: string,
  trx?: Knex.Transaction
): Promise<string> => {
  const { id } = await getCompanyIdentifiers(identifier, trx);
  return id;
};

export const getCompanyShortCode = async (
  identifier: string,
  trx?: Knex.Transaction
): Promise<string> => {
  const { short_code } = await getCompanyIdentifiers(identifier, trx);
  return short_code;
};

export const retryAxios = async <T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((res) => setTimeout(res, 1000 * (4 - retries)));
    return retryAxios(fn, retries - 1);
  }
};
