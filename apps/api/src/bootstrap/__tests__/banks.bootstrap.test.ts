import { describe, expect, it } from 'vitest';

import { BANKS_CATALOG } from '../catalogs/banks/banks.js';
import { COUNTRIES_CATALOG } from '../catalogs/countries/countries.js';
import { bootstrapBanks } from '../phases/banks.bootstrap.js';
import { SYSTEM_USER_ID } from '../phases/users.bootstrap.js';

import type { BootstrappedCountry } from '../phases/countries.bootstrap.js';

type BankRow = {
  id: string;
  key: string;
  display_name: string;
  official_name: string | null;
  swift_code: string | null;
  local_code: string | null;
  local_code_type: string | null;
  alternate_identifier: string | null;
  website: string | null;
  logo_url: string | null;
  country_id: string;
  created_by_id: string;
  updated_by_id: string | null;
  is_deleted: boolean;
  deleted_at: Date | null;
};

const countriesByCode = Object.fromEntries(
  COUNTRIES_CATALOG.map((country) => [
    country.code,
    {
      id: country.id,
      code: country.code,
      name: country.name,
      phone_code: country.phoneCode,
      flag: country.flag,
      continent: country.continent,
    },
  ]),
) as Record<string, BootstrappedCountry>;

function createFakeTransaction(initialRows: BankRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.banks');

    return {
      select: (...columns: (keyof BankRow)[]) => ({
        whereIn: async (column: keyof BankRow, values: string[]) =>
          rows
            .filter((row) => values.includes(String(row[column])))
            .map((row) =>
              Object.fromEntries(columns.map((key) => [key, row[key]])),
            ),
      }),
      insert: (insertRows: BankRow[]) => ({
        onConflict: (column: keyof BankRow) => ({
          merge: (mutableColumns: (keyof BankRow)[]) => ({
            whereRaw: async () => {
              for (const insertRow of insertRows) {
                const existing = rows.find(
                  (row) => row[column] === insertRow[column],
                );
                if (!existing) {
                  rows.push({ ...insertRow });
                  continue;
                }

                for (const mutableColumn of mutableColumns) {
                  Object.assign(existing, {
                    [mutableColumn]: insertRow[mutableColumn],
                  });
                }
              }
            },
          }),
        }),
      }),
    };
  }) as unknown as Parameters<typeof bootstrapBanks>[0];

  return { trx, rows };
}

function runtimeBank(): BankRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    key: 'us_runtime_discovered_bank',
    display_name: 'Runtime Discovered Bank',
    official_name: null,
    swift_code: null,
    local_code: null,
    local_code_type: null,
    alternate_identifier: null,
    website: null,
    logo_url: null,
    country_id: countriesByCode.US.id,
    created_by_id: SYSTEM_USER_ID,
    updated_by_id: null,
    is_deleted: false,
    deleted_at: null,
  };
}

describe('bootstrapBanks', () => {
  it('upserts canonical banks idempotently without touching runtime banks', async () => {
    const runtime = runtimeBank();
    const { trx, rows } = createFakeTransaction([runtime]);

    await bootstrapBanks(trx, {
      countriesByCode,
      systemUserId: SYSTEM_USER_ID,
    });
    await bootstrapBanks(trx, {
      countriesByCode,
      systemUserId: SYSTEM_USER_ID,
    });

    expect(rows).toHaveLength(BANKS_CATALOG.length + 1);
    expect(rows).toContainEqual(runtime);
  });

  it('reconciles mutable catalog fields without changing row identity', async () => {
    const catalogBank = BANKS_CATALOG[0]!;
    const originalCreatorId = '00000000-0000-0000-0000-000000000003';
    const stale = {
      ...runtimeBank(),
      id: catalogBank.id,
      key: catalogBank.key,
      display_name: 'Stale display name',
      country_id: countriesByCode[catalogBank.country]!.id,
      created_by_id: originalCreatorId,
      is_deleted: true,
      deleted_at: new Date(),
    };
    const { trx, rows } = createFakeTransaction([stale]);

    await bootstrapBanks(trx, {
      countriesByCode,
      systemUserId: SYSTEM_USER_ID,
    });

    expect(rows[0]).toMatchObject({
      id: catalogBank.id,
      key: catalogBank.key,
      display_name: catalogBank.displayName,
      created_by_id: originalCreatorId,
      updated_by_id: SYSTEM_USER_ID,
      is_deleted: false,
      deleted_at: null,
    });
  });

  it('fails rather than changing the id of an existing canonical key', async () => {
    const catalogBank = BANKS_CATALOG[0]!;
    const conflicting = {
      ...runtimeBank(),
      id: '00000000-0000-0000-0000-000000000002',
      key: catalogBank.key,
    };
    const { trx } = createFakeTransaction([conflicting]);

    await expect(
      bootstrapBanks(trx, { countriesByCode, systemUserId: SYSTEM_USER_ID }),
    ).rejects.toThrow(/id mismatches/i);
  });

  it('fails when a catalog bank references an unresolved country', async () => {
    const { trx } = createFakeTransaction();

    await expect(
      bootstrapBanks(trx, {
        countriesByCode: {},
        systemUserId: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow(/could not resolve country/i);
  });
});
