import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * One-to-one restricted secret store for bank connections. Only the provider
 * execution boundary should load these rows; ordinary connection queries must
 * never select them. Revocation/destruction orchestration is deliberately a
 * later lifecycle milestone.
 */

const schemaName = 'app';
const tableName = 'bank_connection_secrets';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('bank_connection_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_connections`)
      .onDelete('CASCADE');

    table.text('encrypted_access_token').notNullable();
    table.text('encrypted_refresh_token').nullable();

    table.integer('encryption_key_version').notNullable();

    table
      .timestamp('rotated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('When the token material was last written or rotated');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['bank_connection_id'], {
      indexName: 'bank_connection_secrets_connection_uniq',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Restricted one-to-one encrypted provider token store for bank_connections. Never selected by ordinary connection reads.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_connection_secrets_tokens_nonempty_chk
        CHECK (
          char_length(encrypted_access_token) >= 1
          AND (encrypted_refresh_token IS NULL OR char_length(encrypted_refresh_token) >= 1)
        ),
      ADD CONSTRAINT bank_connection_secrets_key_version_chk
        CHECK (encryption_key_version >= 1);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
