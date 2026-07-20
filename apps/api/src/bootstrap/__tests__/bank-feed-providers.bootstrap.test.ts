import { describe, expect, it } from 'vitest';

import { BANK_FEED_PROVIDERS_CATALOG } from '../catalogs/bank-feed-providers/bank-feed-providers.js';
import { bootstrapBankFeedProviders } from '../phases/bank-feed-providers.bootstrap.js';
import { SYSTEM_USER_ID } from '../phases/users.bootstrap.js';

import type { BankFeedProviderStatus } from '../catalogs/bank-feed-providers/bank-feed-providers.js';
import type { BootstrappedCountry } from '../phases/countries.bootstrap.js';

type BankFeedProviderRow = {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  status: BankFeedProviderStatus;
  created_by_id: string;
  updated_by_id: string | null;
};

type BankFeedProviderCountryRow = {
  bank_feed_provider_id: string;
  country_id: string;
  active: boolean;
  created_by_id: string;
  updated_by_id: string | null;
};

function createCountriesByCode(): Record<string, BootstrappedCountry> {
  const countryCodes = [
    ...new Set(
      BANK_FEED_PROVIDERS_CATALOG.flatMap((provider) => provider.countryCodes),
    ),
  ];

  return Object.fromEntries(
    countryCodes.map((code, index) => [
      code,
      {
        id: `00000000-0000-0000-0000-${String(index + 100).padStart(12, '0')}`,
        code,
        name: code,
        phone_code: '+1',
        flag: null,
        continent: null,
      },
    ]),
  );
}

function createFakeTransaction(
  initialProviderRows: BankFeedProviderRow[] = [],
  initialCountryRows: BankFeedProviderCountryRow[] = [],
) {
  const providerRows = initialProviderRows.map((row) => ({ ...row }));
  const countryRows = initialCountryRows.map((row) => ({ ...row }));

  const trx = ((tableName: string) => {
    if (tableName === 'app.bank_feed_provider_countries') {
      return {
        insert: (insertRows: BankFeedProviderCountryRow[]) => ({
          onConflict: (columns: (keyof BankFeedProviderCountryRow)[]) => ({
            ignore: async () => {
              for (const insertRow of insertRows) {
                const existing = countryRows.find((row) =>
                  columns.every((column) => row[column] === insertRow[column]),
                );
                if (!existing) {
                  countryRows.push({ ...insertRow });
                }
              }
            },
          }),
        }),
      };
    }

    if (tableName !== 'app.bank_feed_providers') {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return {
      select: (...columns: (keyof BankFeedProviderRow)[]) => ({
        whereIn: async (column: keyof BankFeedProviderRow, values: string[]) =>
          providerRows
            .filter((row) => values.includes(String(row[column])))
            .map((row) =>
              Object.fromEntries(columns.map((key) => [key, row[key]])),
            ),
      }),
      insert: (insertRows: BankFeedProviderRow[]) => ({
        onConflict: (column: keyof BankFeedProviderRow) => ({
          merge: (mutableColumns: (keyof BankFeedProviderRow)[]) => ({
            whereRaw: async () => {
              for (const insertRow of insertRows) {
                const existing = providerRows.find(
                  (row) => row[column] === insertRow[column],
                );
                if (!existing) {
                  providerRows.push({ ...insertRow });
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
  }) as unknown as Parameters<typeof bootstrapBankFeedProviders>[0];

  return { trx, providerRows, countryRows };
}

function runtimeProvider(): BankFeedProviderRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    key: 'future_provider',
    display_name: 'Future Provider',
    description: null,
    website: null,
    logo_url: null,
    status: 'inactive',
    created_by_id: SYSTEM_USER_ID,
    updated_by_id: null,
  };
}

describe('bootstrapBankFeedProviders', () => {
  it('upserts canonical providers idempotently without touching runtime providers', async () => {
    const runtime = runtimeProvider();
    const { trx, providerRows } = createFakeTransaction([runtime]);

    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });
    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });

    expect(providerRows).toHaveLength(BANK_FEED_PROVIDERS_CATALOG.length + 1);
    expect(providerRows).toContainEqual(runtime);
  });

  it('reconciles mutable catalog fields without changing row identity', async () => {
    const catalogProvider = BANK_FEED_PROVIDERS_CATALOG[0]!;
    const originalCreatorId = '00000000-0000-0000-0000-000000000003';
    const stale = {
      ...runtimeProvider(),
      id: catalogProvider.id,
      key: catalogProvider.key,
      display_name: 'Stale display name',
      description: 'Stale description',
      status: 'deprecated' as const,
      created_by_id: originalCreatorId,
    };
    const { trx, providerRows } = createFakeTransaction([stale]);

    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });

    expect(providerRows[0]).toMatchObject({
      id: catalogProvider.id,
      key: catalogProvider.key,
      display_name: catalogProvider.displayName,
      description: catalogProvider.description,
      status: catalogProvider.status,
      created_by_id: originalCreatorId,
      updated_by_id: SYSTEM_USER_ID,
    });
  });

  it('fails rather than changing the id of an existing canonical key', async () => {
    const catalogProvider = BANK_FEED_PROVIDERS_CATALOG[0]!;
    const conflicting = {
      ...runtimeProvider(),
      id: '00000000-0000-0000-0000-000000000002',
      key: catalogProvider.key,
    };
    const { trx } = createFakeTransaction([conflicting]);

    await expect(
      bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID }),
    ).rejects.toThrow(/id mismatches/i);
  });

  it('creates canonical provider-country mappings idempotently', async () => {
    const countriesByCode = createCountriesByCode();
    const { trx, countryRows } = createFakeTransaction();

    await bootstrapBankFeedProviders(trx, {
      systemUserId: SYSTEM_USER_ID,
      countriesByCode,
    });
    await bootstrapBankFeedProviders(trx, {
      systemUserId: SYSTEM_USER_ID,
      countriesByCode,
    });

    const expectedMappings = BANK_FEED_PROVIDERS_CATALOG.flatMap((provider) =>
      provider.countryCodes.map((countryCode) => ({
        bank_feed_provider_id: provider.id,
        country_id: countriesByCode[countryCode]!.id,
        active: true,
        created_by_id: SYSTEM_USER_ID,
        updated_by_id: SYSTEM_USER_ID,
      })),
    );

    expect(countryRows).toHaveLength(expectedMappings.length);
    expect(countryRows).toEqual(
      expect.arrayContaining(
        expectedMappings.map((row) => expect.objectContaining(row)),
      ),
    );
  });

  it('does not reactivate existing disabled provider-country mappings', async () => {
    const countriesByCode = createCountriesByCode();
    const catalogProvider = BANK_FEED_PROVIDERS_CATALOG[0]!;
    const country = countriesByCode[catalogProvider.countryCodes[0]!]!;
    const originalUpdaterId = '00000000-0000-0000-0000-000000000004';
    const disabledMapping = {
      bank_feed_provider_id: catalogProvider.id,
      country_id: country.id,
      active: false,
      created_by_id: SYSTEM_USER_ID,
      updated_by_id: originalUpdaterId,
    };
    const { trx, countryRows } = createFakeTransaction([], [disabledMapping]);

    await bootstrapBankFeedProviders(trx, {
      systemUserId: SYSTEM_USER_ID,
      countriesByCode,
    });

    expect(
      countryRows.find(
        (row) =>
          row.bank_feed_provider_id === catalogProvider.id &&
          row.country_id === country.id,
      ),
    ).toEqual(disabledMapping);
  });

  it('fails when a canonical provider references an unknown country', async () => {
    const { trx } = createFakeTransaction();

    await expect(
      bootstrapBankFeedProviders(trx, {
        systemUserId: SYSTEM_USER_ID,
        countriesByCode: {},
      }),
    ).rejects.toThrow(/references unknown country/i);
  });
});
