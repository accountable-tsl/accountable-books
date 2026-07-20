import type { Knex } from 'knex';

import { CURRENCIES_CATALOG } from '../catalogs/currencies/currencies.js';

import type { CurrencyCatalogEntry } from '../catalogs/currencies/currencies.js';

const schemaName = 'app';
const tableName = 'currencies';
const currenciesTable = `${schemaName}.${tableName}`;
const CURRENCY_COLUMNS = [
  'id',
  'code',
  'name',
  'symbol',
  'minor_unit',
] as const;

export type BootstrappedCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  minor_unit: number;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function toDbSeed(currency: CurrencyCatalogEntry): BootstrappedCurrency {
  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    minor_unit: currency.minorUnit,
  };
}

function hasCurrencyDrift(
  existing: BootstrappedCurrency,
  expected: BootstrappedCurrency,
): boolean {
  return (
    existing.name !== expected.name ||
    existing.symbol !== expected.symbol ||
    existing.minor_unit !== expected.minor_unit
  );
}

function buildCurrencyMap(
  rows: BootstrappedCurrency[],
): Record<string, BootstrappedCurrency> {
  return Object.fromEntries(rows.map((currency) => [currency.code, currency]));
}

export async function bootstrapCurrencies(
  trx: Knex.Transaction,
): Promise<{ currenciesByCode: Record<string, BootstrappedCurrency> }> {
  const canonical = CURRENCIES_CATALOG.map(toDbSeed);
  const canonicalByCode = new Map(
    canonical.map((currency) => [currency.code, currency]),
  );

  const existing = (await trx(currenciesTable)
    .select(...CURRENCY_COLUMNS)
    .whereIn(
      'code',
      canonical.map((currency) => currency.code),
    )) as BootstrappedCurrency[];

  const mismatchedIds = existing.filter((currency) => {
    const expected = canonicalByCode.get(currency.code);
    return expected ? expected.id !== currency.id : false;
  });

  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((currency) => {
        const expected = canonicalByCode.get(currency.code)!;
        return `${currency.code} (expected ${expected.id}, found ${currency.id})`;
      })
      .join(', ');

    throw new BootstrapCatalogError(
      `Currency bootstrap found id mismatches in ${currenciesTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  const drifted = existing.filter((currency) => {
    const expected = canonicalByCode.get(currency.code);
    return expected ? hasCurrencyDrift(currency, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((currency) => {
        const expected = canonicalByCode.get(currency.code)!;
        return trx(currenciesTable).where({ code: currency.code }).update({
          name: expected.name,
          symbol: expected.symbol,
          minor_unit: expected.minor_unit,
        });
      }),
    );
  }

  await trx(currenciesTable).insert(canonical).onConflict('code').ignore();

  const bootstrapped = (await trx(currenciesTable)
    .select(...CURRENCY_COLUMNS)
    .whereIn(
      'code',
      canonical.map((currency) => currency.code),
    )) as BootstrappedCurrency[];

  const allCurrencies = (await trx(currenciesTable).select(
    ...CURRENCY_COLUMNS,
  )) as BootstrappedCurrency[];

  const unexpected = allCurrencies.filter(
    (currency) =>
      !canonical.some(
        (canonicalCurrency) => canonicalCurrency.code === currency.code,
      ),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Currency bootstrap found unexpected currencies in ${currenciesTable}: ${unexpected
        .map((currency) => currency.code)
        .join(
          ', ',
        )}. This catalog is reserved for canonical system currencies only.`,
    );
  }

  const missing = canonical.filter(
    (currency) =>
      !bootstrapped.some(
        (bootstrappedCurrency) => bootstrappedCurrency.code === currency.code,
      ),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `Currency bootstrap could not materialize catalog rows in ${currenciesTable}: ${missing
        .map((currency) => currency.code)
        .join(', ')}.`,
    );
  }

  return {
    currenciesByCode: buildCurrencyMap(bootstrapped),
  };
}
