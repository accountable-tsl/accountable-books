import type { Knex } from 'knex';

import { COUNTRIES_CATALOG } from '../catalogs/countries/countries.js';

import type { CountryCatalogEntry } from '../catalogs/countries/countries.js';

const schemaName = 'app';
const tableName = 'countries';
const countriesTable = `${schemaName}.${tableName}`;
const COUNTRY_COLUMNS = [
  'id',
  'code',
  'name',
  'phone_code',
  'flag',
  'continent',
] as const;

export type BootstrappedCountry = {
  id: string;
  code: string;
  name: string;
  phone_code: string;
  flag: string | null;
  continent: string | null;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function toDbSeed(country: CountryCatalogEntry): BootstrappedCountry {
  return {
    id: country.id,
    code: country.code,
    name: country.name,
    phone_code: country.phoneCode,
    flag: country.flag,
    continent: country.continent,
  };
}

function hasCountryDrift(
  existing: BootstrappedCountry,
  expected: BootstrappedCountry,
): boolean {
  return (
    existing.name !== expected.name ||
    existing.phone_code !== expected.phone_code ||
    (existing.flag ?? null) !== expected.flag ||
    (existing.continent ?? null) !== expected.continent
  );
}

function buildCountryMap(
  rows: BootstrappedCountry[],
): Record<string, BootstrappedCountry> {
  return Object.fromEntries(rows.map((country) => [country.code, country]));
}

export async function bootstrapCountries(
  trx: Knex.Transaction,
): Promise<{ countriesByCode: Record<string, BootstrappedCountry> }> {
  const canonical = COUNTRIES_CATALOG.map(toDbSeed);
  const canonicalByCode = new Map(
    canonical.map((country) => [country.code, country]),
  );

  const existing = (await trx(countriesTable)
    .select(...COUNTRY_COLUMNS)
    .whereIn(
      'code',
      canonical.map((country) => country.code),
    )) as BootstrappedCountry[];

  const mismatchedIds = existing.filter((country) => {
    const expected = canonicalByCode.get(country.code);
    return expected ? expected.id !== country.id : false;
  });

  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((country) => {
        const expected = canonicalByCode.get(country.code)!;
        return `${country.code} (expected ${expected.id}, found ${country.id})`;
      })
      .join(', ');

    throw new BootstrapCatalogError(
      `Country bootstrap found id mismatches in ${countriesTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  const drifted = existing.filter((country) => {
    const expected = canonicalByCode.get(country.code);
    return expected ? hasCountryDrift(country, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((country) => {
        const expected = canonicalByCode.get(country.code)!;
        return trx(countriesTable).where({ code: country.code }).update({
          name: expected.name,
          phone_code: expected.phone_code,
          flag: expected.flag,
          continent: expected.continent,
        });
      }),
    );
  }

  await trx(countriesTable).insert(canonical).onConflict('code').ignore();

  const bootstrapped = (await trx(countriesTable)
    .select(...COUNTRY_COLUMNS)
    .whereIn(
      'code',
      canonical.map((country) => country.code),
    )) as BootstrappedCountry[];

  const allCountries = (await trx(countriesTable).select(
    ...COUNTRY_COLUMNS,
  )) as BootstrappedCountry[];

  const unexpected = allCountries.filter(
    (country) =>
      !canonical.some(
        (canonicalCountry) => canonicalCountry.code === country.code,
      ),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Country bootstrap found unexpected countries in ${countriesTable}: ${unexpected
        .map((country) => country.code)
        .join(
          ', ',
        )}. This catalog is reserved for canonical system countries only.`,
    );
  }

  const missing = canonical.filter(
    (country) =>
      !bootstrapped.some(
        (bootstrappedCountry) => bootstrappedCountry.code === country.code,
      ),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `Country bootstrap could not materialize catalog rows in ${countriesTable}: ${missing
        .map((country) => country.code)
        .join(', ')}.`,
    );
  }

  return {
    countriesByCode: buildCountryMap(bootstrapped),
  };
}
