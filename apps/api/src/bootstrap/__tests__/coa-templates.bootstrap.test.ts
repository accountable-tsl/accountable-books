import { describe, expect, it } from 'vitest';

import { ACCOUNT_TYPES_CATALOG } from '../catalogs/accounting/account-types.js';
import {
  buildCoaTemplateNaturalKey,
  loadCoaTemplateCatalog,
} from '../catalogs/coa-templates/coa-templates.js';
import { bootstrapCoaTemplates } from '../phases/coa-templates.bootstrap.js';

import type { AccountTypeKey } from '../catalogs/accounting/account-types.js';
import type { CoaTemplateCatalogEntry } from '../catalogs/coa-templates/coa-templates.js';
import type { BootstrappedAccountType } from '../phases/account-types.bootstrap.js';
import type { BootstrappedCoaTemplate } from '../phases/coa-templates.bootstrap.js';

const accountTypesByKey = Object.fromEntries(
  ACCOUNT_TYPES_CATALOG.map((row) => [
    row.key,
    {
      id: row.id,
      key: row.key,
      label: row.label,
      description: row.description,
      report_code: row.report_code,
      account_element_id: row.account_element_key,
      default_monetary:
        'default_monetary' in row ? (row.default_monetary ?? false) : false,
      label_role: row.label_role,
      trainable: row.trainable,
      is_contra: row.is_contra,
      is_postable_control: row.is_postable_control,
      accrual_targets:
        'accrual_targets' in row && row.accrual_targets
          ? [...row.accrual_targets]
          : null,
    },
  ]),
) as Record<AccountTypeKey, BootstrappedAccountType>;

function createFakeTransaction(initialRows: BootstrappedCoaTemplate[]) {
  const rows = [...initialRows];
  let generatedId = rows.length;

  const trx = ((tableName: string) => {
    expect(tableName).toBe('app.coa_templates');

    const projectRows = (
      columns: string[],
      sourceRows: BootstrappedCoaTemplate[],
    ) =>
      sourceRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column,
            row[column as keyof BootstrappedCoaTemplate],
          ]),
        ),
      );

    return {
      select: (...columns: string[]) =>
        Promise.resolve(projectRows(columns, rows)),
      where: (criteria: Partial<BootstrappedCoaTemplate>) => ({
        update: async (
          patch: Partial<
            Omit<BootstrappedCoaTemplate, 'id' | 'template_name' | 'name'>
          >,
        ) => {
          const row = rows.find((candidate) =>
            Object.entries(criteria).every(
              ([key, value]) =>
                candidate[key as keyof BootstrappedCoaTemplate] === value,
            ),
          );
          if (!row) return 0;
          Object.assign(row, patch);
          return 1;
        },
      }),
      insert: async (
        insertRows: Array<Omit<BootstrappedCoaTemplate, 'id'>>,
      ) => {
        for (const insertRow of insertRows) {
          generatedId += 1;
          rows.push({
            id: `generated-coa-template-${generatedId}`,
            ...insertRow,
          });
        }
      },
    };
  }) as unknown as Parameters<typeof bootstrapCoaTemplates>[0];

  return { trx, rows };
}

function toBootstrappedRow(
  row: CoaTemplateCatalogEntry,
): BootstrappedCoaTemplate {
  return {
    id: `existing-${buildCoaTemplateNaturalKey(row)}`,
    template_name: row.template_name,
    code: row.code,
    name: row.name,
    description: row.description,
    account_type_id: accountTypesByKey[row.account_type_key].id,
    is_active: row.is_active,
    locked: row.locked,
  };
}

describe('bootstrapCoaTemplates', () => {
  it('inserts all canonical rows and is idempotent', async () => {
    const { trx, rows } = createFakeTransaction([]);

    const first = await bootstrapCoaTemplates(trx, { accountTypesByKey });
    expect(rows).toHaveLength(714);
    expect(Object.keys(first.coaTemplatesByNaturalKey)).toHaveLength(714);
    expect(first.catalog.templates).toHaveLength(8);

    const second = await bootstrapCoaTemplates(trx, { accountTypesByKey });
    expect(second.coaTemplatesByNaturalKey).toEqual(
      first.coaTemplatesByNaturalKey,
    );
    expect(rows).toHaveLength(714);
  });

  it('reconciles canonical metadata drift', async () => {
    const catalog = await loadCoaTemplateCatalog();
    const canonical = catalog.rows.find(
      (row) =>
        row.template_name === 'biz:saas:basic:code:v1' && row.code === '74001',
    )!;
    const expected = toBootstrappedRow(canonical);
    const { trx, rows } = createFakeTransaction([
      {
        ...expected,
        name: 'Old Account Name',
        description: 'Old description',
        account_type_id: accountTypesByKey.ca_bank.id,
        is_active: false,
        locked: !expected.locked,
      },
    ]);

    await bootstrapCoaTemplates(trx, { accountTypesByKey });

    const updated = rows.find(
      (row) =>
        buildCoaTemplateNaturalKey(row) ===
        buildCoaTemplateNaturalKey(expected),
    )!;
    expect(updated.name).toBe(expected.name);
    expect(updated.description).toBe(expected.description);
    expect(updated.account_type_id).toBe(expected.account_type_id);
    expect(updated.is_active).toBe(expected.is_active);
    expect(updated.locked).toBe(expected.locked);
  });

  it('fails when extra non-canonical rows exist', async () => {
    const { trx } = createFakeTransaction([
      {
        id: 'extra-template-row',
        template_name: 'biz:none:basic:nocode:v1',
        code: null,
        name: 'Custom Account',
        description: 'A custom non-canonical template row.',
        account_type_id: accountTypesByKey.rev_revenue.id,
        is_active: true,
        locked: false,
      },
    ]);

    await expect(
      bootstrapCoaTemplates(trx, { accountTypesByKey }),
    ).rejects.toThrow(/unexpected rows/i);
  });

  it('fails when an account type dependency is missing', async () => {
    const { trx } = createFakeTransaction([]);
    const { rev_revenue: _omitted, ...incompleteAccountTypesByKey } =
      accountTypesByKey;

    await expect(
      bootstrapCoaTemplates(trx, {
        accountTypesByKey:
          incompleteAccountTypesByKey as unknown as typeof accountTypesByKey,
      }),
    ).rejects.toThrow(/was not bootstrapped/i);
  });
});
