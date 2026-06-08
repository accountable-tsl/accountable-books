import { describe, expect, it } from 'vitest';

import { BANK_FEED_PROVIDERS_CATALOG } from '../catalogs/bank-feed-providers/bank-feed-providers.js';
import { bootstrapBankFeedProviders } from '../phases/bank-feed-providers.bootstrap.js';
import { SYSTEM_USER_ID } from '../phases/users.bootstrap.js';

import type { BankFeedProviderStatus } from '../catalogs/bank-feed-providers/bank-feed-providers.js';

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

function createFakeTransaction(initialRows: BankFeedProviderRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.bank_feed_providers');

    return {
      select: (...columns: (keyof BankFeedProviderRow)[]) => ({
        whereIn: async (column: keyof BankFeedProviderRow, values: string[]) =>
          rows
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
  }) as unknown as Parameters<typeof bootstrapBankFeedProviders>[0];

  return { trx, rows };
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
    const { trx, rows } = createFakeTransaction([runtime]);

    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });
    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });

    expect(rows).toHaveLength(BANK_FEED_PROVIDERS_CATALOG.length + 1);
    expect(rows).toContainEqual(runtime);
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
    const { trx, rows } = createFakeTransaction([stale]);

    await bootstrapBankFeedProviders(trx, { systemUserId: SYSTEM_USER_ID });

    expect(rows[0]).toMatchObject({
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
});
