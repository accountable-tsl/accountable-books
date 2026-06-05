import type { Knex } from 'knex';
import { ROLES } from '@accountable-books/contracts/schema';

import type { RoleKey, RoleScope } from '../../domains/roles/roles.types.js';

const schemaName = 'app';
const tableName = 'roles';
const rolesTable = `${schemaName}.${tableName}`;
const ROLE_COLUMNS = ['id', 'key', 'scope', 'name', 'description'] as const;

type CanonicalRoleSeed = {
  key: RoleKey;
  scope: RoleScope;
  name: string;
  description: string | null;
};

export type BootstrappedRole = {
  id: string;
  key: RoleKey;
  scope: RoleScope;
  name: string;
  description: string | null;
};

class BootstrapCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapCatalogError';
  }
}

const CANONICAL_ROLES: readonly CanonicalRoleSeed[] = [
  ...ROLES.PLATFORM_ROLES.map((role) => ({
    key: role.key,
    scope: 'platform' as const,
    name: role.name,
    description: role.description ?? null,
  })),
  ...ROLES.FIRM_ROLES.map((role) => ({
    key: role.key,
    scope: 'firm' as const,
    name: role.name,
    description: role.description ?? null,
  })),
  ...ROLES.COMPANY_ROLES.map((role) => ({
    key: role.key,
    scope: 'company' as const,
    name: role.name,
    description: role.description ?? null,
  })),
] as const satisfies readonly CanonicalRoleSeed[];

function buildRoleMap(
  rows: BootstrappedRole[],
): Record<RoleKey, BootstrappedRole> {
  return Object.fromEntries(rows.map((role) => [role.key, role])) as Record<
    RoleKey,
    BootstrappedRole
  >;
}

function hasRoleDrift(
  existing: BootstrappedRole,
  expected: CanonicalRoleSeed,
): boolean {
  return (
    existing.scope !== expected.scope ||
    existing.name !== expected.name ||
    (existing.description ?? null) !== expected.description
  );
}

function formatRoleSummary(
  role: Pick<CanonicalRoleSeed, 'key' | 'scope' | 'name'>,
) {
  return `${role.key} (${role.scope}/${role.name})`;
}

export async function bootstrapRoles(
  trx: Knex.Transaction,
): Promise<{ rolesByKey: Record<RoleKey, BootstrappedRole> }> {
  const existing = await trx(rolesTable)
    .select(...ROLE_COLUMNS)
    .whereIn(
      'key',
      CANONICAL_ROLES.map((role) => role.key),
    );

  const existingByKey = new Map(existing.map((role) => [role.key, role]));
  const missing = CANONICAL_ROLES.filter(
    (role) => !existingByKey.has(role.key),
  );
  const drifted = CANONICAL_ROLES.filter((role) => {
    const current = existingByKey.get(role.key);
    return current ? hasRoleDrift(current as BootstrappedRole, role) : false;
  });

  if (drifted.length > 0) {
    await Promise.all(
      drifted.map((role) =>
        trx(rolesTable).where({ key: role.key }).update({
          scope: role.scope,
          name: role.name,
          description: role.description,
        }),
      ),
    );
  }

  if (missing.length > 0) {
    await trx(rolesTable).insert(missing).onConflict('key').ignore();
  }

  const bootstrapped = (await trx(rolesTable).select(
    ...ROLE_COLUMNS,
  )) as BootstrappedRole[];

  const bootstrappedByKey = new Map(
    bootstrapped.map((role) => [role.key, role]),
  );
  const unexpected = bootstrapped.filter(
    (role) => !CANONICAL_ROLES.some((canonical) => canonical.key === role.key),
  );

  if (unexpected.length > 0) {
    throw new BootstrapCatalogError(
      `Role bootstrap found unexpected roles in ${rolesTable}: ${unexpected
        .map((role) => formatRoleSummary(role))
        .join(
          ', ',
        )}. This catalog is reserved for canonical system roles only.`,
    );
  }

  const unresolvedMissing = CANONICAL_ROLES.filter(
    (role) => !bootstrappedByKey.has(role.key),
  );

  if (unresolvedMissing.length > 0) {
    throw new BootstrapCatalogError(
      `Role bootstrap could not materialize canonical roles in ${rolesTable}: ${unresolvedMissing
        .map((role) => formatRoleSummary(role))
        .join(', ')}.`,
    );
  }

  return {
    rolesByKey: buildRoleMap(
      CANONICAL_ROLES.map((role) => bootstrappedByKey.get(role.key)!),
    ),
  };
}
