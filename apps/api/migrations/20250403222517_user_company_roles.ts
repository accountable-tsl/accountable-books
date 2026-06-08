import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * User-company roles grant a user one active role within a company workspace.
 * The role definition remains platform-owned; this table is the membership
 * assignment for a specific workspace.
 */

const schemaName = 'app';
const tableName = 'user_company_roles';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('CASCADE');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.roles`)
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.index(
      ['company_id', 'role_id'],
      'user_company_roles_company_role_idx',
    );
    table.index(['user_id'], 'user_company_roles_user_id_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_company_roles_active_unique
    ON "${schemaName}"."${tableName}" (user_id, company_id)
    WHERE is_deleted = false
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT user_company_roles_deleted_state_chk
    CHECK (
      (is_deleted = false AND deleted_at IS NULL)
      OR
      (is_deleted = true AND deleted_at IS NOT NULL)
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
