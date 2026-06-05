import type { Knex } from 'knex';

import { preventUpdateOrDelete } from '../migrations/utils/db.js';

const tableName = 'role_permissions';

// Role-permission mappings (currently unused)
/*
const _rolePermissions: Record<Exclude<string, 'super_admin'>, string[]> = {
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
*/

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
