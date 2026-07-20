import type { Knex } from 'knex';

import {
  buildCoaTemplateNaturalKey,
  loadCoaTemplateCatalog,
} from '../catalogs/coa-templates/coa-templates.js';

import type { AccountTypeKey } from '../catalogs/accounting/account-types.js';
import type {
  CoaTemplateCatalogEntry,
  LoadCoaTemplateCatalogResult,
} from '../catalogs/coa-templates/coa-templates.js';
import type { BootstrappedAccountType } from './account-types.bootstrap.js';

const schemaName = 'app';
const tableName = 'coa_templates';
const coaTemplatesTable = `${schemaName}.${tableName}`;
const COA_TEMPLATE_COLUMNS = [
  'id',
  'template_name',
  'code',
  'name',
  'description',
  'account_type_id',
  'is_active',
  'locked',
] as const;

export type BootstrappedCoaTemplate = {
  id: string;
  template_name: string;
  code: string | null;
  name: string;
  description: string | null;
  account_type_id: string;
  is_active: boolean;
  locked: boolean;
};

type CoaTemplateInsertRow = Omit<BootstrappedCoaTemplate, 'id'>;

export type BootstrapCoaTemplatesOptions = {
  accountTypesByKey: Record<AccountTypeKey, BootstrappedAccountType>;
  catalogFilePath?: string;
};

export type BootstrapCoaTemplatesResult = {
  coaTemplatesByNaturalKey: Record<string, BootstrappedCoaTemplate>;
  catalog: Pick<
    LoadCoaTemplateCatalogResult,
    'filePath' | 'rowsRead' | 'templates' | 'accountTypeKeysUsed'
  >;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function buildCoaTemplateMap(
  rows: BootstrappedCoaTemplate[],
): Record<string, BootstrappedCoaTemplate> {
  return Object.fromEntries(
    rows.map((row) => [buildCoaTemplateNaturalKey(row), row]),
  );
}

function toDatabaseRow(
  row: CoaTemplateCatalogEntry,
  accountTypesByKey: BootstrapCoaTemplatesOptions['accountTypesByKey'],
): CoaTemplateInsertRow {
  const accountType = accountTypesByKey[row.account_type_key];

  if (!accountType) {
    throw new BootstrapCatalogError(
      `COA template "${buildCoaTemplateNaturalKey(row)}" references account type "${row.account_type_key}", but it was not bootstrapped.`,
    );
  }

  return {
    template_name: row.template_name,
    code: row.code,
    name: row.name,
    description: row.description,
    account_type_id: accountType.id,
    is_active: row.is_active,
    locked: row.locked,
  };
}

function hasCoaTemplateDrift(
  existing: BootstrappedCoaTemplate,
  expected: CoaTemplateInsertRow,
): boolean {
  return (
    existing.name !== expected.name ||
    existing.description !== expected.description ||
    existing.account_type_id !== expected.account_type_id ||
    existing.is_active !== expected.is_active ||
    existing.locked !== expected.locked
  );
}

async function insertMissingRows(
  trx: Knex.Transaction,
  rows: CoaTemplateInsertRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await trx(coaTemplatesTable).insert(rows);
}

export async function bootstrapCoaTemplates(
  trx: Knex.Transaction,
  options: BootstrapCoaTemplatesOptions,
): Promise<BootstrapCoaTemplatesResult> {
  const catalog = await loadCoaTemplateCatalog(options.catalogFilePath);
  const desiredRows = catalog.rows.map((row) =>
    toDatabaseRow(row, options.accountTypesByKey),
  );
  const desiredByNaturalKey = new Map(
    desiredRows.map((row) => [buildCoaTemplateNaturalKey(row), row] as const),
  );

  const existing = (await trx(coaTemplatesTable).select(
    ...COA_TEMPLATE_COLUMNS,
  )) as BootstrappedCoaTemplate[];

  const unexpected = existing.filter(
    (row) => !desiredByNaturalKey.has(buildCoaTemplateNaturalKey(row)),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `COA template bootstrap found unexpected rows in ${coaTemplatesTable}: ${unexpected
        .map((row) => buildCoaTemplateNaturalKey(row))
        .join(
          ', ',
        )}. Add new canonical COA templates to the bootstrap catalog before using them.`,
    );
  }

  const existingByNaturalKey = new Map(
    existing.map((row) => [buildCoaTemplateNaturalKey(row), row] as const),
  );

  await insertMissingRows(
    trx,
    desiredRows.filter(
      (row) => !existingByNaturalKey.has(buildCoaTemplateNaturalKey(row)),
    ),
  );

  const current = (await trx(coaTemplatesTable).select(
    ...COA_TEMPLATE_COLUMNS,
  )) as BootstrappedCoaTemplate[];

  const drifted = current.filter((row) => {
    const expected = desiredByNaturalKey.get(buildCoaTemplateNaturalKey(row));
    return expected ? hasCoaTemplateDrift(row, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((row) => {
        const expected = desiredByNaturalKey.get(
          buildCoaTemplateNaturalKey(row),
        )!;
        return trx(coaTemplatesTable).where({ id: row.id }).update({
          name: expected.name,
          description: expected.description,
          account_type_id: expected.account_type_id,
          is_active: expected.is_active,
          locked: expected.locked,
        });
      }),
    );
  }

  const bootstrapped = (await trx(coaTemplatesTable).select(
    ...COA_TEMPLATE_COLUMNS,
  )) as BootstrappedCoaTemplate[];

  const missing = desiredRows.filter(
    (row) =>
      !bootstrapped.some(
        (currentRow) =>
          buildCoaTemplateNaturalKey(currentRow) ===
          buildCoaTemplateNaturalKey(row),
      ),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `COA template bootstrap could not materialize catalog rows in ${coaTemplatesTable}: ${missing
        .map((row) => buildCoaTemplateNaturalKey(row))
        .join(', ')}`,
    );
  }

  return {
    coaTemplatesByNaturalKey: buildCoaTemplateMap(
      desiredRows.map(
        (row) =>
          bootstrapped.find(
            (currentRow) =>
              buildCoaTemplateNaturalKey(currentRow) ===
              buildCoaTemplateNaturalKey(row),
          )!,
      ),
    ),
    catalog: {
      filePath: catalog.filePath,
      rowsRead: catalog.rowsRead,
      templates: catalog.templates,
      accountTypeKeysUsed: catalog.accountTypeKeysUsed,
    },
  };
}
