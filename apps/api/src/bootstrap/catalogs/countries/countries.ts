import { z } from 'zod';

import countriesJson from './countries.json' with { type: 'json' };

const countryCatalogEntry = z.object({
  id: z.uuid(),
  code: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  name: z.string().trim().min(2).max(128),
  phone_code: z
    .string()
    .trim()
    .regex(/^\+[0-9]{1,14}$/),
  flag: z.string().trim().min(1).max(10).nullish(),
  continent: z.string().trim().min(2).max(50).nullish(),
});

type CountryCatalogJsonEntry = z.infer<typeof countryCatalogEntry>;

export type CountryCatalogEntry = {
  id: string;
  code: string;
  name: string;
  phoneCode: string;
  flag: string | null;
  continent: string | null;
};

function ensureUniqueBy<K extends keyof CountryCatalogEntry>(
  rows: CountryCatalogEntry[],
  key: K,
): void {
  const seen = new Set<CountryCatalogEntry[K]>();
  for (const row of rows) {
    if (seen.has(row[key])) {
      throw new Error(`Duplicate country catalog ${String(key)}: ${row[key]}`);
    }
    seen.add(row[key]);
  }
}

function normalizeCatalog(
  rows: CountryCatalogJsonEntry[],
): CountryCatalogEntry[] {
  return rows.map((row) => ({
    id: row.id,
    code: row.code.trim().toUpperCase(),
    name: row.name.trim(),
    phoneCode: row.phone_code.trim(),
    flag: row.flag?.trim() ?? null,
    continent: row.continent?.trim() ?? null,
  }));
}

function parseCountryCatalog(input: unknown): CountryCatalogEntry[] {
  const parsed = z.array(countryCatalogEntry).parse(input);
  const normalized = normalizeCatalog(parsed);

  ensureUniqueBy(normalized, 'id');
  ensureUniqueBy(normalized, 'code');

  return normalized;
}

export const COUNTRIES_CATALOG: readonly CountryCatalogEntry[] = Object.freeze(
  parseCountryCatalog(countriesJson),
);

const countryCatalogByCode = new Map<string, CountryCatalogEntry>(
  COUNTRIES_CATALOG.map((country) => [country.code, country]),
);

export function getCountryFromCatalogByCode(
  code: string,
): CountryCatalogEntry | undefined {
  return countryCatalogByCode.get(code.trim().toUpperCase());
}
