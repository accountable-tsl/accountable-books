import type { Knex } from 'knex';

/**
 * Role-permission mappings define which canonical permissions each canonical
 * role grants.
 */

const schemaName = 'app';
const tableName = 'role_permissions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.roles`)
      .onDelete('CASCADE');
    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.permissions`)
      .onDelete('CASCADE');

    table.primary(['role_id', 'permission_id']);
    table.index(['permission_id'], 'role_permissions_permission_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
