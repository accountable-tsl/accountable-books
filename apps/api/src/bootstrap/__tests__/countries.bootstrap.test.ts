import { describe, expect, it } from 'vitest';

import { COUNTRIES_CATALOG } from '../catalogs/countries/countries.js';
import { bootstrapCountries } from '../phases/countries.bootstrap.js';

import type { BootstrappedCountry } from '../phases/countries.bootstrap.js';

function createFakeTransaction(initialRows: BootstrappedCountry[]) {
  const rows = [...initialRows];

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.countries');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedCountry[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((columnName) => [
            columnName,
            row[columnName as keyof BootstrappedCountry],
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
                  String(row[column as keyof BootstrappedCountry]),
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
        update: async (patch: Partial<BootstrappedCountry>) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedCountry] === value,
            ),
          );

          if (row) {
            Object.assign(row, patch);
            return 1;
          }

          return 0;
        },
      }),
      insert: (insertRows: BootstrappedCountry[]) => ({
        onConflict: (column: keyof BootstrappedCountry) => ({
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
  }) as unknown as Parameters<typeof bootstrapCountries>[0];

  return { trx, rows };
}

describe('bootstrapCountries', () => {
  it('reconciles rows idempotently across repeated runs', async () => {
    const usCatalog = COUNTRIES_CATALOG.find(
      (country) => country.code === 'US',
    );
    expect(usCatalog).toBeDefined();

    const { trx, rows } = createFakeTransaction([
      {
        id: usCatalog!.id,
        code: 'US',
        name: 'United States of America (old)',
        phone_code: '+1',
        flag: null,
        continent: null,
      },
    ]);

    const first = await bootstrapCountries(trx);
    const second = await bootstrapCountries(trx);

    expect(Object.keys(first.countriesByCode)).toHaveLength(
      COUNTRIES_CATALOG.length,
    );
    expect(Object.keys(second.countriesByCode)).toHaveLength(
      COUNTRIES_CATALOG.length,
    );
    expect(rows).toHaveLength(COUNTRIES_CATALOG.length);
    expect(second.countriesByCode.US.name).toBe(usCatalog!.name);
    expect(second.countriesByCode.US.flag).toBe(usCatalog!.flag);
  });

  it('fails when unexpected countries exist in the reserved catalog', async () => {
    const { trx } = createFakeTransaction([
      {
        id: '00000000-0000-0000-0000-000000000001',
        code: 'ZZ',
        name: 'Unexpected Country',
        phone_code: '+999',
        flag: null,
        continent: null,
      },
    ]);

    await expect(bootstrapCountries(trx)).rejects.toThrow(
      /unexpected countries/i,
    );
  });
});
