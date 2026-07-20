import { describe, expect, it } from 'vitest';

import { ACCOUNT_ELEMENTS_CATALOG } from '../catalogs/accounting/account-elements.js';
import { FINANCIAL_STATEMENTS_CATALOG } from '../catalogs/accounting/financial-statements.js';
import { bootstrapAccountElements } from '../phases/account-elements.bootstrap.js';

import type { FinancialStatementKey } from '../catalogs/accounting/financial-statements.js';
import type { BootstrappedAccountElement } from '../phases/account-elements.bootstrap.js';
import type { BootstrappedFinancialStatement } from '../phases/financial-statements.bootstrap.js';

const financialStatementsByKey = Object.fromEntries(
  FINANCIAL_STATEMENTS_CATALOG.map((row) => [row.key, row]),
) as Record<FinancialStatementKey, BootstrappedFinancialStatement>;

function createFakeTransaction(initialRows: BootstrappedAccountElement[]) {
  const rows = [...initialRows];

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.account_elements');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedAccountElement[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column,
            row[column as keyof BootstrappedAccountElement],
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
      where: (criteria: Partial<BootstrappedAccountElement>) => ({
        update: async (
          patch: Partial<Omit<BootstrappedAccountElement, 'id' | 'key'>>,
        ) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedAccountElement] === value,
            ),
          );
          if (!row) return 0;
          Object.assign(row, patch);
          return 1;
        },
      }),
      insert: (insertRows: BootstrappedAccountElement[]) => ({
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
  }) as unknown as Parameters<typeof bootstrapAccountElements>[0];

  return { trx, rows };
}

describe('bootstrapAccountElements', () => {
  it('inserts all canonical rows parent-first and is idempotent', async () => {
    const { trx, rows } = createFakeTransaction([]);

    const first = await bootstrapAccountElements(trx, {
      financialStatementsByKey,
    });

    expect(rows).toHaveLength(ACCOUNT_ELEMENTS_CATALOG.length);
    expect(first.accountElementsByKey.assets.parent_id).toBeNull();
    expect(first.accountElementsByKey.current_asset.parent_id).toBe(
      first.accountElementsByKey.assets.id,
    );

    const second = await bootstrapAccountElements(trx, {
      financialStatementsByKey,
    });

    expect(second.accountElementsByKey).toEqual(first.accountElementsByKey);
    expect(rows).toHaveLength(ACCOUNT_ELEMENTS_CATALOG.length);
  });

  it('fails when an existing row has the wrong id for a key', async () => {
    const canonical = ACCOUNT_ELEMENTS_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      {
        ...canonical,
        id: '00000000-0000-4000-8000-000000000001',
        parent_id: null,
        financial_statement_id: financialStatementsByKey.bs.id,
      },
    ]);

    await expect(
      bootstrapAccountElements(trx, { financialStatementsByKey }),
    ).rejects.toThrow(/id mismatches/i);
  });

  it('reconciles canonical metadata drift', async () => {
    const canonical = ACCOUNT_ELEMENTS_CATALOG.find(
      (row) => row.key === 'current_asset',
    )!;
    const { trx, rows } = createFakeTransaction([
      {
        ...canonical,
        label: 'Old Current Asset',
        default_side: 'credit',
        report_code: 'BS.ASS.OLD',
        parent_id: null,
        financial_statement_id: financialStatementsByKey.is.id,
      },
    ]);

    await bootstrapAccountElements(trx, { financialStatementsByKey });

    const updated = rows.find((row) => row.key === 'current_asset')!;
    expect(updated.label).toBe(canonical.label);
    expect(updated.default_side).toBe(canonical.default_side);
    expect(updated.report_code).toBe(canonical.report_code);
    expect(updated.parent_id).toBe(
      ACCOUNT_ELEMENTS_CATALOG.find((row) => row.key === 'assets')!.id,
    );
    expect(updated.financial_statement_id).toBe(financialStatementsByKey.bs.id);
  });

  it('fails when extra non-canonical rows exist', async () => {
    const canonical = ACCOUNT_ELEMENTS_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      {
        ...canonical,
        parent_id: null,
        financial_statement_id: financialStatementsByKey.bs.id,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        key: 'custom_element',
        label: 'Custom Element',
        default_side: 'debit',
        description: null,
        report_code: 'BS.CUS',
        parent_id: null,
        financial_statement_id: financialStatementsByKey.bs.id,
      } as unknown as BootstrappedAccountElement,
    ]);

    await expect(
      bootstrapAccountElements(trx, { financialStatementsByKey }),
    ).rejects.toThrow(/unexpected rows/i);
  });
});
