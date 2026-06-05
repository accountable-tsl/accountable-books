import { describe, expect, it } from 'vitest';

import { FINANCIAL_STATEMENTS_CATALOG } from '../catalogs/accounting/financial-statements.js';
import { bootstrapFinancialStatements } from '../phases/financial-statements.bootstrap.js';

import type { BootstrappedFinancialStatement } from '../phases/financial-statements.bootstrap.js';

function createFakeTransaction(initialRows: BootstrappedFinancialStatement[]) {
  const rows = [...initialRows];

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.financial_statements');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedFinancialStatement[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column,
            row[column as keyof BootstrappedFinancialStatement],
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
      where: (criteria: Partial<BootstrappedFinancialStatement>) => ({
        update: async (
          patch: Partial<Omit<BootstrappedFinancialStatement, 'id' | 'key'>>,
        ) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedFinancialStatement] ===
                value,
            ),
          );
          if (!row) return 0;
          Object.assign(row, patch);
          return 1;
        },
      }),
      insert: (insertRows: BootstrappedFinancialStatement[]) => ({
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
  }) as unknown as Parameters<typeof bootstrapFinancialStatements>[0];

  return { trx, rows };
}

describe('bootstrapFinancialStatements', () => {
  it('inserts all canonical rows and is idempotent', async () => {
    const { trx, rows } = createFakeTransaction([]);

    const first = await bootstrapFinancialStatements(trx);
    expect(Object.keys(first.financialStatementsByKey).sort()).toEqual([
      'bs',
      'cf',
      'is',
    ]);
    expect(rows).toHaveLength(FINANCIAL_STATEMENTS_CATALOG.length);

    const second = await bootstrapFinancialStatements(trx);
    expect(second.financialStatementsByKey).toEqual(
      first.financialStatementsByKey,
    );
    expect(rows).toHaveLength(FINANCIAL_STATEMENTS_CATALOG.length);
  });

  it('fails when an existing row has the wrong id for a key', async () => {
    const canonical = FINANCIAL_STATEMENTS_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      {
        ...canonical,
        id: '00000000-0000-4000-8000-000000000001',
      },
    ]);

    await expect(bootstrapFinancialStatements(trx)).rejects.toThrow(
      /id mismatches/i,
    );
  });

  it('reconciles canonical label drift', async () => {
    const canonical = FINANCIAL_STATEMENTS_CATALOG[0]!;
    const { trx, rows } = createFakeTransaction([
      {
        ...canonical,
        default_label: 'Old Label',
      },
    ]);

    await bootstrapFinancialStatements(trx);

    expect(rows[0]?.default_label).toBe(canonical.default_label);
  });

  it('fails when extra non-canonical rows exist', async () => {
    const canonical = FINANCIAL_STATEMENTS_CATALOG[0]!;
    const { trx } = createFakeTransaction([
      canonical,
      {
        id: '00000000-0000-4000-8000-000000000002',
        key: 'custom_statement' as BootstrappedFinancialStatement['key'],
        us_gaap_label: 'Custom Statement',
        ifrs_label: 'Custom Statement',
        default_label: 'Custom Statement',
      },
    ]);

    await expect(bootstrapFinancialStatements(trx)).rejects.toThrow(
      /unexpected rows/i,
    );
  });
});
