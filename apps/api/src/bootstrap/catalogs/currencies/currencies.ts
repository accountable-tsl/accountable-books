import { z } from 'zod';

import currenciesJson from './currencies.json' with { type: 'json' };

const currencyCatalogEntry = z.object({
  id: z.uuid(),
  code: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  name: z.string().trim().min(2).max(100),
  symbol: z.string().trim().min(1).max(8),
  minorUnit: z.int().min(0).max(4),
});

export type CurrencyCatalogEntry = z.infer<typeof currencyCatalogEntry>;

function ensureUniqueBy<K extends keyof CurrencyCatalogEntry>(
  rows: CurrencyCatalogEntry[],
  key: K,
): void {
  const seen = new Set<CurrencyCatalogEntry[K]>();
  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(`Duplicate currency catalog ${String(key)}: ${row[key]}`);
    }
    seen.add(row[key]);
  }
}

function normalizeCatalog(
  rows: CurrencyCatalogEntry[],
): CurrencyCatalogEntry[] {
  return rows.map((row) => ({
    id: row.id,
    code: row.code.trim().toUpperCase(),
    name: row.name.trim(),
    symbol: row.symbol.trim(),
    minorUnit: row.minorUnit,
  }));
}

function parseCurrencyCatalog(input: unknown): CurrencyCatalogEntry[] {
  const parsed = z.array(currencyCatalogEntry).parse(input);
  const normalized = normalizeCatalog(parsed);

  ensureUniqueBy(normalized, 'id');
  ensureUniqueBy(normalized, 'code');

  return normalized;
}

export const CURRENCIES_CATALOG: readonly CurrencyCatalogEntry[] =
  Object.freeze(parseCurrencyCatalog(currenciesJson));

const currencyCatalogByCode = new Map<string, CurrencyCatalogEntry>(
  CURRENCIES_CATALOG.map((currency) => [currency.code, currency]),
);

export function getCurrencyFromCatalogByCode(
  code: string,
): CurrencyCatalogEntry | undefined {
  return currencyCatalogByCode.get(code.trim().toUpperCase());
}
