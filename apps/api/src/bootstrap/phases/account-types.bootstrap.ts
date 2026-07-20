import type { Knex } from 'knex';

import { ACCOUNT_TYPES_CATALOG } from '../catalogs/accounting/account-types.js';

import type { AccountElementKey } from '../catalogs/accounting/account-elements.js';
import type {
  AccountTypeCatalogEntry,
  AccountTypeKey,
  AccountTypeLabelRole,
} from '../catalogs/accounting/account-types.js';
import type { BootstrappedAccountElement } from './account-elements.bootstrap.js';

const schemaName = 'app';
const tableName = 'account_types';
const accountTypesTable = `${schemaName}.${tableName}`;
const ACCOUNT_TYPE_COLUMNS = [
  'id',
  'key',
  'label',
  'description',
  'report_code',
  'account_element_id',
  'default_monetary',
  'label_role',
  'trainable',
  'is_contra',
  'is_postable_control',
  'accrual_targets',
] as const;

export type BootstrappedAccountType = {
  id: string;
  key: AccountTypeKey;
  label: string;
  description: string | null;
  report_code: string;
  account_element_id: string;
  default_monetary: boolean;
  label_role: AccountTypeLabelRole;
  trainable: boolean;
  is_contra: boolean;
  is_postable_control: boolean;
  accrual_targets: string[] | null;
};

export type BootstrapAccountTypesOptions = {
  accountElementsByKey: Record<AccountElementKey, BootstrappedAccountElement>;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

function buildAccountTypeMap(
  rows: BootstrappedAccountType[],
): Record<AccountTypeKey, BootstrappedAccountType> {
  return Object.fromEntries(rows.map((row) => [row.key, row])) as Record<
    AccountTypeKey,
    BootstrappedAccountType
  >;
}

function arraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function assertCatalogIntegrity(
  canonical: readonly AccountTypeCatalogEntry[],
): void {
  const keys = new Set<string>();
  const ids = new Set<string>();

  for (const row of canonical) {
    if (keys.has(row.key)) {
      throw new BootstrapCatalogError(
        `Account type catalog contains duplicate key "${row.key}".`,
      );
    }
    keys.add(row.key);

    if (ids.has(row.id)) {
      throw new BootstrapCatalogError(
        `Account type catalog contains duplicate id "${row.id}".`,
      );
    }
    ids.add(row.id);
  }

  for (const row of canonical) {
    for (const targetKey of row.accrual_targets ?? []) {
      if (!keys.has(targetKey)) {
        throw new BootstrapCatalogError(
          `Account type "${row.key}" references unknown accrual target "${targetKey}".`,
        );
      }
    }
  }
}

function toDatabaseRow(
  row: AccountTypeCatalogEntry,
  accountElementsByKey: BootstrapAccountTypesOptions['accountElementsByKey'],
): BootstrappedAccountType {
  const accountElement = accountElementsByKey[row.account_element_key];

  if (!accountElement) {
    throw new BootstrapCatalogError(
      `Account type "${row.key}" references account element "${row.account_element_key}", but it was not bootstrapped.`,
    );
  }

  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    report_code: row.report_code,
    account_element_id: accountElement.id,
    default_monetary: row.default_monetary ?? false,
    label_role: row.label_role,
    trainable: row.trainable,
    is_contra: row.is_contra,
    is_postable_control: row.is_postable_control,
    accrual_targets: row.accrual_targets ? [...row.accrual_targets] : null,
  };
}

function hasAccountTypeDrift(
  existing: BootstrappedAccountType,
  expected: BootstrappedAccountType,
): boolean {
  return (
    existing.label !== expected.label ||
    existing.description !== expected.description ||
    existing.report_code !== expected.report_code ||
    existing.account_element_id !== expected.account_element_id ||
    existing.default_monetary !== expected.default_monetary ||
    existing.label_role !== expected.label_role ||
    existing.trainable !== expected.trainable ||
    existing.is_contra !== expected.is_contra ||
    existing.is_postable_control !== expected.is_postable_control ||
    !arraysEqual(existing.accrual_targets, expected.accrual_targets)
  );
}

export async function bootstrapAccountTypes(
  trx: Knex.Transaction,
  options: BootstrapAccountTypesOptions,
): Promise<{
  accountTypesByKey: Record<AccountTypeKey, BootstrappedAccountType>;
}> {
  const canonical = [...ACCOUNT_TYPES_CATALOG];
  assertCatalogIntegrity(canonical);

  const canonicalByKey = new Map(
    canonical.map((row) => [row.key, row] as const),
  );
  const keys = canonical.map((row) => row.key);
  const desiredRows = canonical.map((row) =>
    toDatabaseRow(row, options.accountElementsByKey),
  );
  const desiredByKey = new Map(
    desiredRows.map((row) => [row.key, row] as const),
  );

  const existing = (await trx(accountTypesTable)
    .select(...ACCOUNT_TYPE_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountType[];

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
      `Account type bootstrap found id mismatches in ${accountTypesTable}: ${details}. Resolve manually before re-running bootstrap.`,
    );
  }

  await trx(accountTypesTable).insert(desiredRows).onConflict('key').ignore();

  const current = (await trx(accountTypesTable)
    .select(...ACCOUNT_TYPE_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountType[];

  const drifted = current.filter((row) => {
    const expected = desiredByKey.get(row.key);
    return expected ? hasAccountTypeDrift(row, expected) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((row) => {
        const expected = desiredByKey.get(row.key)!;
        return trx(accountTypesTable).where({ key: row.key }).update({
          label: expected.label,
          description: expected.description,
          report_code: expected.report_code,
          account_element_id: expected.account_element_id,
          default_monetary: expected.default_monetary,
          label_role: expected.label_role,
          trainable: expected.trainable,
          is_contra: expected.is_contra,
          is_postable_control: expected.is_postable_control,
          accrual_targets: expected.accrual_targets,
        });
      }),
    );
  }

  const bootstrapped = (await trx(accountTypesTable)
    .select(...ACCOUNT_TYPE_COLUMNS)
    .whereIn('key', keys)) as BootstrappedAccountType[];

  const allAccountTypes = (await trx(accountTypesTable).select(
    ...ACCOUNT_TYPE_COLUMNS,
  )) as BootstrappedAccountType[];

  const unexpected = allAccountTypes.filter(
    (row) => !canonicalByKey.has(row.key),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Account type bootstrap found unexpected rows in ${accountTypesTable}: ${unexpected
        .map((row) => row.key)
        .join(
          ', ',
        )}. Add new canonical account type keys to the bootstrap catalog before using them.`,
    );
  }

  const missing = desiredRows.filter(
    (row) => !bootstrapped.some((currentRow) => currentRow.key === row.key),
  );

  if (missing.length > 0) {
    throw new BootstrapCatalogError(
      `Account type bootstrap could not materialize catalog rows in ${accountTypesTable}: ${missing.map((row) => row.key).join(', ')}.`,
    );
  }

  return {
    accountTypesByKey: buildAccountTypeMap(
      desiredRows.map(
        (row) => bootstrapped.find((currentRow) => currentRow.key === row.key)!,
      ),
    ),
  };
}
