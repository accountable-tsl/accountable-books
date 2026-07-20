import type { Knex } from 'knex';

import { FINANCIAL_STATEMENTS_CATALOG } from '../catalogs/accounting/financial-statements.js';

import type {
  FinancialStatementCatalogEntry,
  FinancialStatementKey,
} from '../catalogs/accounting/financial-statements.js';

const schemaName = 'app';
const tableName = 'financial_statements';
const financialStatementsTable = `${schemaName}.${tableName}`;
const FS_COLUMNS = [
  'id',
  'key',
  'us_gaap_label',
  'ifrs_label',
  'default_label',
] as const;

export type BootstrappedFinancialStatement = FinancialStatementCatalogEntry;

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function buildFinancialStatementMap(
  rows: BootstrappedFinancialStatement[],
): Record<FinancialStatementKey, BootstrappedFinancialStatement> {
  return Object.fromEntries(rows.map((row) => [row.key, row])) as Record<
    FinancialStatementKey,
    BootstrappedFinancialStatement
  >;
}

function hasFinancialStatementDrift(
  existing: BootstrappedFinancialStatement,
  expected: BootstrappedFinancialStatement,
): boolean {
  return (
    existing.us_gaap_label !== expected.us_gaap_label ||
    existing.ifrs_label !== expected.ifrs_label ||
    existing.default_label !== expected.default_label
  );
}

export async function bootstrapFinancialStatements(
  trx: Knex.Transaction,
): Promise<{
  financialStatementsByKey: Record<
    FinancialStatementKey,
    BootstrappedFinancialStatement
  >;
}> {
  const canonical = [...FINANCIAL_STATEMENTS_CATALOG];
  const canonicalByKey = new Map(
    canonical.map((row) => [row.key, row] as const),
  );
  const keys = canonical.map((row) => row.key);

  const existing = (await trx(financialStatementsTable)
    .select(...FS_COLUMNS)
    .whereIn('key', keys)) as BootstrappedFinancialStatement[];

  const mismatchedIds = existing.filter((row) => {
    const expected = canonicalByKey.get(row.key);
    return expected ? expected.id !== row.id : false;
  });

  if (mismatchedIds.length > 0) {
    const details = mismatchedIds
      .map((row) => {
        const expected = canonicalByKey.get(row.key)!;
        return `${row.key} (expected ${expected.id}, found ${row.id})`;
      })
      .join(', ');

    throw new BootstrapCatalogError(
      `Financial statement bootstrap found id mismatches in ${financialStatementsTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  const drifted = existing.filter((row) => {
    const expected = canonicalByKey.get(row.key);
    return expected ? hasFinancialStatementDrift(row, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((row) => {
        const expected = canonicalByKey.get(row.key)!;
        return trx(financialStatementsTable).where({ key: row.key }).update({
          us_gaap_label: expected.us_gaap_label,
          ifrs_label: expected.ifrs_label,
          default_label: expected.default_label,
        });
      }),
    );
  }

  await trx(financialStatementsTable)
    .insert(canonical)
    .onConflict('key')
    .ignore();

  const bootstrapped = (await trx(financialStatementsTable)
    .select(...FS_COLUMNS)
    .whereIn('key', keys)) as BootstrappedFinancialStatement[];

  const allFinancialStatements = (await trx(financialStatementsTable).select(
    ...FS_COLUMNS,
  )) as BootstrappedFinancialStatement[];

  const unexpected = allFinancialStatements.filter(
    (row) => !canonicalByKey.has(row.key),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Financial statement bootstrap found unexpected rows in ${financialStatementsTable}: ${unexpected
        .map((row) => row.key)
        .join(
          ', ',
        )}. Add new canonical financial statement keys to the bootstrap catalog before using them.`,
    );
  }

  const missing = canonical.filter(
    (row) => !bootstrapped.some((current) => current.key === row.key),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `Financial statement bootstrap could not materialize catalog rows in ${financialStatementsTable}: ${missing.map((row) => row.key).join(', ')}.`,
    );
  }

  return {
    financialStatementsByKey: buildFinancialStatementMap(
      canonical.map(
        (row) => bootstrapped.find((current) => current.key === row.key)!,
      ),
    ),
  };
}
