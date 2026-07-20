import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { loadFxPack } from './load-fx-pack.js';

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
  }) as unknown as Parameters<typeof loadFxPack>[0]['trx'];

  return {
    trx,
    rowsByKey,
  };
}

const currenciesByCode = {
  USD: { id: 'usd-id', code: 'USD' },
  NGN: { id: 'ngn-id', code: 'NGN' },
  GBP: { id: 'gbp-id', code: 'GBP' },
};

describe('loadFxPack', () => {
  it('loads valid rows and skips invalid/unknown/same-currency rows', async () => {
    const { trx, rowsByKey } = createFakeTransaction();
    const fixturePath = new URL(
      './__fixtures__/cbn-sample.csv',
      import.meta.url,
    );

    const result = await loadFxPack({
      pack: {
        id: 'cbn',
        provider: 'cbn',
        source: 'seed',
        filePath: fileURLToPath(fixturePath),
        description: 'CBN fixture',
      },
      trx,
      currenciesByCode,
      filePathOverride: fileURLToPath(fixturePath),
      chunkSize: 2,
    });

    expect(result.rowsRead).toBe(5);
    expect(result.rowsPrepared).toBe(2);
    expect(result.rowsUpserted).toBe(2);
    expect(result.skippedSameCurrency).toBe(1);
    expect(result.skippedUnknownCurrency).toBe(1);
    expect(result.skippedInvalid).toBe(1);
    expect(rowsByKey.size).toBe(2);

    const usdNgn = rowsByKey.get('2026-05-29|usd-id|ngn-id');
    expect(usdNgn).toBeDefined();
    expect(usdNgn?.rate).toBe('1372.7545');
    expect(usdNgn?.provider).toBe('cbn');
  });

  it('upserts existing rows on conflict', async () => {
    const { trx, rowsByKey } = createFakeTransaction();
    const initialPath = new URL(
      './__fixtures__/cbn-sample.csv',
      import.meta.url,
    );
    const updatedPath = new URL(
      './__fixtures__/cbn-sample-updated.csv',
      import.meta.url,
    );

    await loadFxPack({
      pack: {
        id: 'cbn',
        provider: 'cbn',
        source: 'seed',
        filePath: fileURLToPath(initialPath),
        description: 'CBN fixture',
      },
      trx,
      currenciesByCode,
      filePathOverride: fileURLToPath(initialPath),
    });

    await loadFxPack({
      pack: {
        id: 'cbn',
        provider: 'cbn',
        source: 'seed',
        filePath: fileURLToPath(updatedPath),
        description: 'CBN fixture',
      },
      trx,
      currenciesByCode,
      filePathOverride: fileURLToPath(updatedPath),
    });

    const usdNgn = rowsByKey.get('2026-05-29|usd-id|ngn-id');
    expect(usdNgn?.rate).toBe('1400');

    const gbpUsd = rowsByKey.get('2026-05-29|gbp-id|usd-id');
    expect(gbpUsd?.rate).toBe('1.35');
  });
});
