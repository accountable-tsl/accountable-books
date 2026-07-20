import { describe, expect, it } from 'vitest';

import { CURRENCIES_CATALOG } from '../catalogs/currencies/currencies.js';
import { bootstrapCurrencies } from '../phases/currencies.bootstrap.js';

import type { BootstrappedCurrency } from '../phases/currencies.bootstrap.js';

function createFakeTransaction(initialRows: BootstrappedCurrency[]) {
  const rows = [...initialRows];

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.currencies');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedCurrency[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((columnName) => [
            columnName,
            row[columnName as keyof BootstrappedCurrency],
          ]),
        ),
      );

    return {
      select: (...columns: string[]) => {
        const selected = {
          whereIn: async (column: string, values: string[]) =>
            projectRows(
              columns,
              rows.filter((row) =>
                values.includes(
                  String(row[column as keyof BootstrappedCurrency]),
                ),
              ),
            ),
        };

        return Object.assign(
          Promise.resolve(projectRows(columns, rows)),
          selected,
        );
      },
      where: (criteria: Record<string, unknown>) => ({
        update: async (patch: Partial<BootstrappedCurrency>) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedCurrency] === value,
            ),
          );

          if (row) {
            Object.assign(row, patch);
            return 1;
          }

          return 0;
        },
      }),
      insert: (insertRows: BootstrappedCurrency[]) => ({
        onConflict: (column: keyof BootstrappedCurrency) => ({
          ignore: async () => {
            for (const insertRow of insertRows) {
              const exists = rows.some(
                (row) => row[column] === insertRow[column],
              );
              if (!exists) rows.push({ ...insertRow });
            }
          },
        }),
      }),
    };
  }) as unknown as Parameters<typeof bootstrapCurrencies>[0];

  return { trx, rows };
}

describe('bootstrapCurrencies', () => {
  it('reconciles rows idempotently across repeated runs', async () => {
    const usdCatalog = CURRENCIES_CATALOG.find(
      (currency) => currency.code === 'USD',
    );
    expect(usdCatalog).toBeDefined();

    const { trx, rows } = createFakeTransaction([
      {
        id: usdCatalog!.id,
        code: 'USD',
        name: 'US Dollar (old name)',
        symbol: '$',
        minor_unit: 0,
      },
    ]);

    const first = await bootstrapCurrencies(trx);
    const second = await bootstrapCurrencies(trx);

    expect(Object.keys(first.currenciesByCode)).toHaveLength(
      CURRENCIES_CATALOG.length,
    );
    expect(Object.keys(second.currenciesByCode)).toHaveLength(
      CURRENCIES_CATALOG.length,
    );
    expect(rows).toHaveLength(CURRENCIES_CATALOG.length);
    expect(second.currenciesByCode.USD.minor_unit).toBe(usdCatalog!.minorUnit);
    expect(second.currenciesByCode.USD.name).toBe(usdCatalog!.name);
  });

  it('fails when unexpected currencies exist in the reserved catalog', async () => {
    const { trx } = createFakeTransaction([
      {
        id: '00000000-0000-0000-0000-000000000001',
        code: 'ZZZ',
        name: 'Unexpected Currency',
        symbol: 'ZZZ',
        minor_unit: 2,
      },
    ]);

    await expect(bootstrapCurrencies(trx)).rejects.toThrow(
      /unexpected currencies/i,
    );
  });
});
