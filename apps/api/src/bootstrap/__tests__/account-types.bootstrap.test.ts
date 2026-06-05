import { describe, expect, it } from 'vitest';

import { ACCOUNT_ELEMENTS_CATALOG } from '../catalogs/accounting/account-elements.js';
import { ACCOUNT_TYPES_CATALOG } from '../catalogs/accounting/account-types.js';
import { bootstrapAccountTypes } from '../phases/account-types.bootstrap.js';

import type { AccountElementKey } from '../catalogs/accounting/account-elements.js';
import type { AccountTypeCatalogEntry } from '../catalogs/accounting/account-types.js';
import type { BootstrappedAccountElement } from '../phases/account-elements.bootstrap.js';
import type { BootstrappedAccountType } from '../phases/account-types.bootstrap.js';

const accountElementsByKey = Object.fromEntries(
  ACCOUNT_ELEMENTS_CATALOG.map((row) => [
    row.key,
    {
      id: row.id,
      key: row.key,
      label: row.label,
      default_side: row.default_side,
      description: row.description,
      report_code: row.report_code,
      parent_id: row.parent_key
        ? (ACCOUNT_ELEMENTS_CATALOG.find(
            (parent) => parent.key === row.parent_key,
          )?.id ?? null)
        : null,
      financial_statement_id: row.financial_statement_key,
    },
  ]),
) as Record<AccountElementKey, BootstrappedAccountElement>;

function createFakeTransaction(initialRows: BootstrappedAccountType[]) {
  const rows = [...initialRows];

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.account_types');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedAccountType[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column,
            row[column as keyof BootstrappedAccountType],
          ]),
        ),
      );

    return {
      select: (...columns: string[]) => {
        const allRows = Promise.resolve(projectRows(columns, rows));
        return Object.assign(allRows, {
          whereIn: async (_column: string, values: string[]) =>
            projectRows(
              columns,
              rows.filter((row) => values.includes(row.key)),
            ),
        });
      },
      where: (criteria: Partial<BootstrappedAccountType>) => ({
        update: async (
          patch: Partial<Omit<BootstrappedAccountType, 'id' | 'key'>>,
        ) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedAccountType] === value,
            ),
          );
          if (!row) return 0;
          Object.assign(row, patch);
          return 1;
        },
      }),
      insert: (insertRows: BootstrappedAccountType[]) => ({
        onConflict: (_column: string) => ({
          ignore: async () => {
            for (const insertRow of insertRows) {
              if (!rows.some((row) => row.key === insertRow.key)) {
                rows.push({ ...insertRow });
              }
            }
          },
        }),
      }),
    };
  }) as unknown as Parameters<typeof bootstrapAccountTypes>[0];

  return { trx, rows };
}

function toBootstrappedRow(
  row: AccountTypeCatalogEntry,
): BootstrappedAccountType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    report_code: row.report_code,
    account_element_id: accountElementsByKey[row.account_element_key].id,
    default_monetary: row.default_monetary ?? false,
    label_role: row.label_role,
    trainable: row.trainable,
    is_contra: row.is_contra,
    is_postable_control: row.is_postable_control,
    accrual_targets: row.accrual_targets ? [...row.accrual_targets] : null,
  };
}

describe('bootstrapAccountTypes', () => {
  it('inserts all canonical rows and is idempotent', async () => {
    const { trx, rows } = createFakeTransaction([]);

    const first = await bootstrapAccountTypes(trx, { accountElementsByKey });
    expect(rows).toHaveLength(ACCOUNT_TYPES_CATALOG.length);
    expect(first.accountTypesByKey.ca_bank.account_element_id).toBe(
      accountElementsByKey.current_asset.id,
    );

    const second = await bootstrapAccountTypes(trx, { accountElementsByKey });
    expect(second.accountTypesByKey).toEqual(first.accountTypesByKey);
    expect(rows).toHaveLength(ACCOUNT_TYPES_CATALOG.length);
  });

  it('fails when an existing row has the wrong id for a key', async () => {
    const canonical = ACCOUNT_TYPES_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      {
        ...toBootstrappedRow(canonical),
        id: '00000000-0000-4000-8000-000000000001',
      },
    ]);

    await expect(
      bootstrapAccountTypes(trx, { accountElementsByKey }),
    ).rejects.toThrow(/id mismatches/i);
  });

  it('reconciles canonical metadata drift', async () => {
    const canonical = ACCOUNT_TYPES_CATALOG.find(
      (row) => row.key === 'rev_revenue',
    )!;
    const expected = toBootstrappedRow(canonical);
    const { trx, rows } = createFakeTransaction([
      {
        ...expected,
        label: 'Old Revenue',
        description: 'Old description',
        report_code: 'IS.INC.REV.OLD',
        account_element_id: accountElementsByKey.other_income.id,
        default_monetary: true,
        label_role: 'fallback',
        trainable: false,
        is_contra: true,
        is_postable_control: true,
        accrual_targets: null,
      },
    ]);

    await bootstrapAccountTypes(trx, { accountElementsByKey });

    const updated = rows.find((row) => row.key === 'rev_revenue')!;
    expect(updated.label).toBe(canonical.label);
    expect(updated.description).toBe(canonical.description);
    expect(updated.report_code).toBe(canonical.report_code);
    expect(updated.account_element_id).toBe(accountElementsByKey.revenue.id);
    expect(updated.default_monetary).toBe(expected.default_monetary);
    expect(updated.label_role).toBe(canonical.label_role);
    expect(updated.trainable).toBe(canonical.trainable);
    expect(updated.is_contra).toBe(canonical.is_contra);
    expect(updated.is_postable_control).toBe(canonical.is_postable_control);
    expect(updated.accrual_targets).toEqual(expected.accrual_targets);
  });

  it('fails when extra non-canonical rows exist', async () => {
    const canonical = ACCOUNT_TYPES_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      toBootstrappedRow(canonical),
      {
        id: '00000000-0000-4000-8000-000000000002',
        key: 'custom_account_type',
        label: 'Custom Account Type',
        description: null,
        report_code: 'BS.ASS.CUR.CUS',
        account_element_id: accountElementsByKey.current_asset.id,
        default_monetary: false,
        label_role: 'semantic',
        trainable: true,
        is_contra: false,
        is_postable_control: false,
        accrual_targets: null,
      } as unknown as BootstrappedAccountType,
    ]);

    await expect(
      bootstrapAccountTypes(trx, { accountElementsByKey }),
    ).rejects.toThrow(/unexpected rows/i);
  });

  it('fails when an account element dependency is missing', async () => {
    const { trx } = createFakeTransaction([]);
    const { current_asset: _omitted, ...incompleteAccountElementsByKey } =
      accountElementsByKey;

    await expect(
      bootstrapAccountTypes(trx, {
        accountElementsByKey:
          incompleteAccountElementsByKey as unknown as typeof accountElementsByKey,
      }),
    ).rejects.toThrow(/was not bootstrapped/i);
  });
});
