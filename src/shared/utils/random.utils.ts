import type { Knex } from "knex";
import { getCompanyIdentifiers } from "../../domains/companies/companies.utils";
import { z } from "zod";

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

export const dateFromStringOrDate = z.preprocess((arg) => {
  if (arg instanceof Date) return arg;
  if (typeof arg === "string") {
    const parsed = new Date(arg);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}, z.date());
export const dateOrString = dateFromStringOrDate;
export const dateOrStringOptional = dateFromStringOrDate.optional();
export const dateOrStringNullable = dateFromStringOrDate.nullable();
export const dateOrStringNullish = dateFromStringOrDate.nullish();

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

