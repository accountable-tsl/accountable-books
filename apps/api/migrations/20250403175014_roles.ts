import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Roles define the canonical RBAC access bundles that can be assigned
 * to users within platform, firm, and company scopes.
 */

const schemaName = 'app';
const tableName = 'roles';
const ROLE_SCOPE = ['platform', 'firm', 'company'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('name', 100).notNullable();
    table.string('scope', 24).notNullable().checkIn(ROLE_SCOPE);
    table.string('description', 1024).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT roles_key_normalized_chk
    CHECK (key = lower(btrim(key)) AND key ~ '^[a-z_]+$')
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
