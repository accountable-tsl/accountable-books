import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Permissions define the canonical RBAC capabilities that roles grant,
 * using stable resource:action keys.
 */

const schemaName = 'app';
const tableName = 'permissions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('action', 128).notNullable();
    table.string('resource', 128).notNullable();
    table.specificType(
      'key',
      `text generated always as (resource || ':' || action) stored`,
    );
    table.string('label', 256).notNullable();
    table.text('description').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['key'], { indexName: 'permissions_key_unique' });

    table.index(['action', 'resource'], 'permissions_action_resource_idx');
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT permissions_resource_normalized_chk
      CHECK (resource = lower(btrim(resource)) AND resource ~ '^[a-z][a-z0-9_]*$'),
    ADD CONSTRAINT permissions_action_normalized_chk
      CHECK (action = lower(btrim(action)) AND action ~ '^[a-z][a-z0-9_]*$'),
    ADD CONSTRAINT permissions_key_normalized_chk
      CHECK (key = lower(btrim(key)) AND key ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$');
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
