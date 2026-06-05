import { describe, expect, it } from 'vitest';

import { bootstrapRoles } from '../phases/roles.bootstrap.js';

import type { BootstrappedRole } from '../phases/roles.bootstrap.js';

type QueryRow = BootstrappedRole;

type SelectBuilder = {
  whereIn: (column: keyof QueryRow, values: unknown[]) => Promise<QueryRow[]>;
  then: <T = QueryRow[]>(
    onFulfilled?: ((value: QueryRow[]) => T | PromiseLike<T>) | null,
    onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ) => Promise<T>;
};

function createSelectBuilder(
  rows: QueryRow[],
  columns: (keyof QueryRow)[],
): SelectBuilder {
  const pick = (input: QueryRow[]): QueryRow[] =>
    input.map(
      (row) =>
        Object.fromEntries(
          columns.map((column) => [column, row[column]]),
        ) as QueryRow,
    );

  const runAll = async (): Promise<QueryRow[]> => pick(rows);

  return {
    whereIn: async (column, values) =>
      pick(rows.filter((row) => values.includes(row[column]))),
    then: <T>(
      onFulfilled?: ((value: QueryRow[]) => T | PromiseLike<T>) | null,
      onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
    ): Promise<T> => runAll().then(onFulfilled, onRejected),
  };
}

function createFakeTransaction(initialRows: QueryRow[]) {
  const rows = [...initialRows];
  let idCounter = 1;

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.roles');

    return {
      select: (...columns: (keyof QueryRow)[]) =>
        createSelectBuilder(rows, columns),
      where: (criteria: Partial<QueryRow>) => ({
        update: async (patch: Partial<QueryRow>) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) => candidate[key as keyof QueryRow] === value,
            ),
          );

          if (!row) return 0;
          Object.assign(row, patch);
          return 1;
        },
      }),
      insert: (items: Omit<QueryRow, 'id'>[]) => ({
        onConflict: (column: keyof QueryRow) => ({
          ignore: async () => {
            for (const item of items) {
              const exists = rows.some(
                (row) =>
                  row[column] === item[column as keyof Omit<QueryRow, 'id'>],
              );
              if (exists) continue;

              rows.push({
                id: `generated-${idCounter++}`,
                ...(item as Omit<QueryRow, 'id'>),
              });
            }
          },
        }),
      }),
    };
  }) as Parameters<typeof bootstrapRoles>[0];

  return { trx, rows };
}

describe('bootstrapRoles', () => {
  it('reconciles metadata drift and remains idempotent', async () => {
    const { trx, rows } = createFakeTransaction([]);

    const first = await bootstrapRoles(trx);
    const anyRoleKey = Object.keys(first.rolesByKey)[0];
    expect(anyRoleKey).toBeDefined();

    const drifted = rows.find((role) => role.key === anyRoleKey);
    expect(drifted).toBeDefined();
    drifted!.name = `${drifted!.name} stale`;
    drifted!.description = 'stale-description';
    drifted!.scope = drifted!.scope === 'platform' ? 'company' : 'platform';

    const second = await bootstrapRoles(trx);
    const canonical = second.rolesByKey[anyRoleKey as BootstrappedRole['key']];

    const reconciled = rows.find((role) => role.key === anyRoleKey);
    expect(reconciled?.name).toBe(canonical.name);
    expect(reconciled?.description).toBe(canonical.description);
    expect(reconciled?.scope).toBe(canonical.scope);
  });

  it('fails when unexpected extra roles exist in reserved catalog', async () => {
    const { trx, rows } = createFakeTransaction([]);
    await bootstrapRoles(trx);

    rows.push({
      id: 'unexpected-role-id',
      key: 'custom_role' as BootstrappedRole['key'],
      scope: 'company',
      name: 'Custom Role',
      description: null,
    });

    await expect(bootstrapRoles(trx)).rejects.toThrow(
      'Role bootstrap found unexpected roles',
    );
  });
});
