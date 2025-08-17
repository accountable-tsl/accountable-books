import type { Knex } from 'knex';
import { preventUpdateOrDelete } from './utils/db';
import { NODE_ENV } from '../src/config/env';

const tableName = 'role_permissions';

// Role-permission mappings
const rolePermissions: Record<Exclude<string, 'super_admin'>, string[]> = {
  support: [
    'users:invite',
    'reports:view',
    'reports:export',
    'companies:switch',
    'companies:manage',
    'companies:view',
    'coa:view',
    'coa:update',
    'journals:view',
    'journals:create',
    'journals:update',
    'journals:void',
    'journals:reverse',
    'bank_accounts:view',
    'bank_accounts:link',
    'bank_accounts:upload_csv',
    'transactions:categorize',
    'messages:send',
    'messages:request_files',
    'files:upload',
    'files:download',
    'documents:manage',
  ],
  admin: [
    'users:invite',
    'reports:view',
    'reports:export',
    'companies:switch',
    'companies:manage',
    'companies:view',
    'coa:view',
    'coa:update',
    'journals:view',
    'journals:create',
    'journals:update',
    'journals:void',
    'journals:reverse',
    'bank_accounts:view',
    'bank_accounts:link',
    'bank_accounts:upload_csv',
    'transactions:categorize',
    'messages:send',
    'messages:request_files',
    'files:upload',
    'files:download',
    'documents:manage',
  ],
  bookkeeper: [
    'reports:view',
    'reports:export',
    'companies:switch',
    'companies:view',
    'coa:view',
    'coa:update',
    'journals:view',
    'journals:create',
    'journals:update',
    'journals:void',
    'journals:reverse',
    'bank_accounts:view',
    'bank_accounts:upload_csv',
    'transactions:categorize',
    'messages:send',
    'messages:request_files',
    'files:upload',
    'files:download',
    'documents:manage',
  ],
  demo_user: [
    'reports:view',
    'reports:export',
    'companies:switch',
    'companies:view',
    'coa:view',
    'coa:update',
    'journals:view',
    'journals:create',
    'journals:update',
    'journals:void',
    'journals:reverse',
    'bank_accounts:view',
    'bank_accounts:upload_csv',
    'transactions:categorize',
    'messages:send',
    'messages:request_files',
    'files:upload',
    'files:download',
    'documents:manage',
  ],
  client: [
    'reports:view',
    'reports:export',
    'companies:switch',
    'coa:view',
    'bank_accounts:view',
    'bank_accounts:link',
    'messages:send',
    'files:upload',
    'files:download',
  ],
};

const seedRolePermissions = async function seed(knex: Knex): Promise<void> {
  try {
    const roles = await knex('roles').select('id', 'name');
    const permissions = await knex('permissions').select('id', 'key');

    // Map role/permission IDs
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));
    const permissionMap = new Map(permissions.map((p) => [p.key, p.id]));

    // Build roles_permissions entries
    const entries = Object.entries(rolePermissions).flatMap(([roleName, permKeys]) => {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        console.error(`Role '${roleName}' not found in roleMap`);
        throw new Error(`Invalid role name: '${roleName}'`);
      }

      return permKeys.map((key) => {
        const permissionId = permissionMap.get(key);
        if (!permissionId) {
          console.error(`Permission key '${key}' not found in permissionMap`);
          throw new Error(`Permission ${key} not found`);
        }
        return {
          role_id: roleId,
          permission_id: permissionId,
        };
      });
    });

    // Insert with transaction
    await knex.transaction(async (trx) => {
      await trx(tableName).insert(entries).onConflict(['role_id', 'permission_id']).ignore();
    });

    if (NODE_ENV === 'local' || NODE_ENV === 'docker') {
      console.log(`Seeded ${entries.length} roles_permissions entries`);
    }
  } catch (error) {
    console.error('Error seeding roles_permissions:', error);
    throw error;
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');

    table.timestamp('granted_at', { useTz: true }).defaultTo(knex.fn.now());

    table.primary(['role_id', 'permission_id']);
    table.index(['role_id'], 'roles_permissions_role_id_idx');
  });

  await preventUpdateOrDelete(knex, tableName);

  // await seedRolePermissions(knex);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
