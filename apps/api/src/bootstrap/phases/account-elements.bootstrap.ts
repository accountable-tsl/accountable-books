import type { Knex } from 'knex';

import { ACCOUNT_ELEMENTS_CATALOG } from '../catalogs/accounting/account-elements.js';

import type { DebitCredit } from '../../core/types/core.js';
import type {
  AccountElementCatalogEntry,
  AccountElementKey,
} from '../catalogs/accounting/account-elements.js';
import type { FinancialStatementKey } from '../catalogs/accounting/financial-statements.js';
import type { BootstrappedFinancialStatement } from './financial-statements.bootstrap.js';

const schemaName = 'app';
const tableName = 'account_elements';
const accountElementsTable = `${schemaName}.${tableName}`;
const ACCOUNT_ELEMENT_COLUMNS = [
  'id',
  'key',
  'label',
  'default_side',
  'description',
  'report_code',
  'parent_id',
  'financial_statement_id',
] as const;

export type BootstrappedAccountElement = {
  id: string;
  key: AccountElementKey;
  label: string;
  default_side: DebitCredit;
  description: string | null;
  report_code: string;
  parent_id: string | null;
  financial_statement_id: string;
};

export type BootstrapAccountElementsOptions = {
  financialStatementsByKey: Record<
    FinancialStatementKey,
    BootstrappedFinancialStatement
  >;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function buildAccountElementMap(
  rows: BootstrappedAccountElement[],
): Record<AccountElementKey, BootstrappedAccountElement> {
  return Object.fromEntries(rows.map((row) => [row.key, row])) as Record<
    AccountElementKey,
    BootstrappedAccountElement
  >;
}

function assertCatalogIntegrity(
  canonical: readonly AccountElementCatalogEntry[],
): void {
  const keys = new Set<string>();
  const ids = new Set<string>();

  for (const row of canonical) {
    if (keys.has(row.key)) {
      throw new BootstrapCatalogError(
        `Account element catalog contains duplicate key "${row.key}".`,
      );
    }
    keys.add(row.key);

    if (ids.has(row.id)) {
      throw new BootstrapCatalogError(
        `Account element catalog contains duplicate id "${row.id}".`,
      );
    }
    ids.add(row.id);
  }

  for (const row of canonical) {
    if (row.parent_key && !keys.has(row.parent_key)) {
      throw new BootstrapCatalogError(
        `Account element "${row.key}" references unknown parent "${row.parent_key}".`,
      );
    }

    if (row.parent_key === row.key) {
      throw new BootstrapCatalogError(
        `Account element "${row.key}" cannot reference itself as parent.`,
      );
    }
  }
}

function toDatabaseRow(
  row: AccountElementCatalogEntry,
  canonicalByKey: Map<string, AccountElementCatalogEntry>,
  financialStatementsByKey: BootstrapAccountElementsOptions['financialStatementsByKey'],
): BootstrappedAccountElement {
  const financialStatement =
    financialStatementsByKey[row.financial_statement_key];

  if (!financialStatement) {
    throw new BootstrapCatalogError(
      `Account element "${row.key}" references financial statement "${row.financial_statement_key}", but it was not bootstrapped.`,
    );
  }

  const parent = row.parent_key ? canonicalByKey.get(row.parent_key) : null;

  return {
    id: row.id,
    key: row.key as AccountElementKey,
    label: row.label,
    default_side: row.default_side,
    description: row.description,
    report_code: row.report_code,
    parent_id: parent?.id ?? null,
    financial_statement_id: financialStatement.id,
  };
}

function hasAccountElementDrift(
  existing: BootstrappedAccountElement,
  expected: BootstrappedAccountElement,
): boolean {
  return (
    existing.label !== expected.label ||
    existing.default_side !== expected.default_side ||
    existing.description !== expected.description ||
    existing.report_code !== expected.report_code ||
    existing.parent_id !== expected.parent_id ||
    existing.financial_statement_id !== expected.financial_statement_id
  );
}

async function insertMissingRows(
  trx: Knex.Transaction,
  rows: BootstrappedAccountElement[],
): Promise<void> {
  if (rows.length === 0) return;

  await trx(accountElementsTable).insert(rows).onConflict('key').ignore();
}

export async function bootstrapAccountElements(
  trx: Knex.Transaction,
  options: BootstrapAccountElementsOptions,
): Promise<{
  accountElementsByKey: Record<AccountElementKey, BootstrappedAccountElement>;
}> {
  const canonical = [...ACCOUNT_ELEMENTS_CATALOG];
  assertCatalogIntegrity(canonical);

  const canonicalByKey = new Map(
    canonical.map((row) => [row.key, row] as const),
  );
  const keys = canonical.map((row) => row.key);
  const desiredRows = canonical.map((row) =>
    toDatabaseRow(row, canonicalByKey, options.financialStatementsByKey),
  );
  const desiredByKey = new Map(
    desiredRows.map((row) => [row.key, row] as const),
  );

  const existing = (await trx(accountElementsTable)
    .select(...ACCOUNT_ELEMENT_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountElement[];

  const mismatchedIds = existing.filter((row) => {
    const expected = desiredByKey.get(row.key);
    return expected ? expected.id !== row.id : false;
  });

  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((row) => {
        const expected = desiredByKey.get(row.key)!;
        return `${row.key} (expected ${expected.id}, found ${row.id})`;
      })
      .join(', ');

    throw new BootstrapCatalogError(
      `Account element bootstrap found id mismatches in ${accountElementsTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  await insertMissingRows(
    trx,
    desiredRows.filter((row) => row.parent_id === null),
  );
  await insertMissingRows(
    trx,
    desiredRows.filter((row) => row.parent_id !== null),
  );

  const current = (await trx(accountElementsTable)
    .select(...ACCOUNT_ELEMENT_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountElement[];

  const drifted = current.filter((row) => {
    const expected = desiredByKey.get(row.key);
    return expected ? hasAccountElementDrift(row, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((row) => {
        const expected = desiredByKey.get(row.key)!;
        return trx(accountElementsTable).where({ key: row.key }).update({
          label: expected.label,
          default_side: expected.default_side,
          description: expected.description,
          report_code: expected.report_code,
          parent_id: expected.parent_id,
          financial_statement_id: expected.financial_statement_id,
        });
      }),
    );
  }

  const bootstrapped = (await trx(accountElementsTable)
    .select(...ACCOUNT_ELEMENT_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountElement[];

  const allAccountElements = (await trx(accountElementsTable).select(
    ...ACCOUNT_ELEMENT_COLUMNS,
  )) as BootstrappedAccountElement[];

  const unexpected = allAccountElements.filter(
    (row) => !canonicalByKey.has(row.key),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Account element bootstrap found unexpected rows in ${accountElementsTable}: ${unexpected
        .map((row) => row.key)
        .join(
          ', ',
        )}. Add new canonical account element keys to the bootstrap catalog before using them.`,
    );
  }

  const missing = desiredRows.filter(
    (row) => !bootstrapped.some((currentRow) => currentRow.key === row.key),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `Account element bootstrap could not materialize catalog rows in ${accountElementsTable}: ${missing.map((row) => row.key).join(', ')}.`,
    );
  }

  return {
    accountElementsByKey: buildAccountElementMap(
      desiredRows.map(
        (row) => bootstrapped.find((currentRow) => currentRow.key === row.key)!,
      ),
    ),
  };
}
