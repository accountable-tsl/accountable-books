import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  bootstrapFxSeeds,
  resolveFxSeedPackIdsFromEnv,
} from '../phases/fx-seeds.bootstrap.js';

type FakeExchangeRateRow = {
  rate_date: string;
  base_currency_id: string;
  price_currency_id: string;
  rate: string;
  source: 'seed';
  provider: string;
  ingested_at: Date;
  updated_at: Date;
};

function createFakeTransaction() {
  const rowsByKey = new Map<string, FakeExchangeRateRow>();

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.exchange_rates');

    return {
      insert: (rows: FakeExchangeRateRow[]) => ({
        onConflict: (
          columns: ['rate_date', 'base_currency_id', 'price_currency_id'],
        ) => ({
          merge: async (
            mergeColumns: Array<
              'rate' | 'provider' | 'ingested_at' | 'updated_at'
            >,
          ) => {
            for (const row of rows) {
              const key = columns.map((column) => row[column]).join('|');
              const existing = rowsByKey.get(key);
              if (!existing) {
                rowsByKey.set(key, { ...row });
                continue;
              }

              const merged = { ...existing };
              for (const column of mergeColumns) {
                merged[column] = row[column] as never;
              }
              rowsByKey.set(key, merged);
            }
          },
        }),
      }),
    };
  }) as Parameters<typeof bootstrapFxSeeds>[0];

  return { trx, rowsByKey };
}

const currenciesByCode = {
  USD: {
    id: 'usd-id',
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    minor_unit: 2,
  },
  NGN: { id: 'ngn-id', code: 'NGN', name: 'Naira', symbol: 'N', minor_unit: 2 },
  GBP: { id: 'gbp-id', code: 'GBP', name: 'Pound', symbol: 'P', minor_unit: 2 },
};

describe('resolveFxSeedPackIdsFromEnv', () => {
  it('parses comma-separated ids and all', () => {
    expect(resolveFxSeedPackIdsFromEnv('cbn,boe')).toEqual(['cbn', 'boe']);
    expect(resolveFxSeedPackIdsFromEnv('all')).toEqual(['cbn', 'boe']);
    expect(resolveFxSeedPackIdsFromEnv(undefined)).toEqual([]);
  });
});

describe('bootstrapFxSeeds', () => {
  it('loads selected packs with file overrides', async () => {
    const { trx, rowsByKey } = createFakeTransaction();
    const cbnFixture = fileURLToPath(
      new URL('../catalogs/fx/__fixtures__/cbn-sample.csv', import.meta.url),
    );
    const boeFixture = fileURLToPath(
      new URL(
        '../catalogs/fx/__fixtures__/cbn-sample-updated.csv',
        import.meta.url,
      ),
    );

    const { results } = await bootstrapFxSeeds(trx, {
      currenciesByCode,
      packIds: ['cbn', 'boe'],
      packFilePathOverrides: {
        cbn: cbnFixture,
        boe: boeFixture,
      },
      chunkSize: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.packId).toBe('cbn');
    expect(results[1]?.packId).toBe('boe');
    expect(rowsByKey.size).toBe(2);
  });
});
