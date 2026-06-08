import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Encrypted OAuth/API credentials linking a company to a banking data
 * provider. One row per connection session (e.g. one Plaid "item").
 * Lifecycle is status-based (active → expired → revoked), not soft-delete.
 */

const schemaName = 'app';
const tableName = 'bank_account_credentials';
const CREDENTIAL_STATUSES = ['active', 'expired', 'revoked'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table
      .uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_feed_providers`)
      .onDelete('RESTRICT');

    table
      .string('item_identifier', 256)
      .nullable()
      .comment('Provider-specific connection identifier (e.g. Plaid item_id)');

    table.text('encrypted_access_token').notNullable();
    table.text('encrypted_refresh_token').nullable();

    table.string('institution_id', 256).nullable();
    table.string('institution_name', 256).nullable();

    table
      .jsonb('raw_metadata')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn([...CREDENTIAL_STATUSES], 'bank_account_credentials_status_chk');

    table
      .timestamp('connected_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('connected_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .text('sync_cursor')
      .nullable()
      .comment('Provider-specific sync cursor/token');

    table.jsonb('sync_state').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .boolean('initial_sync_completed')
      .notNullable()
      .defaultTo(false)
      .comment('Whether initial transaction sync is done');

    table
      .date('transactions_from_date')
      .nullable()
      .comment('User preference for transaction sync start date');

    table
      .timestamp('last_transactions_sync_at', { useTz: true })
      .nullable()
      .comment('Last successful transaction sync timestamp');

    table
      .timestamp('expires_at', { useTz: true })
      .nullable()
      .comment('Token expiry timestamp, if applicable for the provider');

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table.index(
      ['company_id', 'provider_id', 'status'],
      'bank_account_credentials_company_provider_status_idx',
    );
    table.unique(
      ['id', 'company_id', 'provider_id'],
      'bank_account_credentials_id_company_provider_uniq',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Encrypted OAuth/API credentials linking a company to a banking data provider. Lifecycle is status-based (active/expired/revoked).';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_account_credentials_company_provider_identifier_uniq
    ON "${schemaName}"."${tableName}" (company_id, provider_id, item_identifier)
    WHERE item_identifier IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX bank_account_credentials_active_sync_idx
    ON "${schemaName}"."${tableName}" (company_id, last_transactions_sync_at)
    WHERE status = 'active';
  `);

  await knex.raw(`
    CREATE INDEX bank_account_credentials_item_identifier_idx
    ON "${schemaName}"."${tableName}" (item_identifier)
    WHERE item_identifier IS NOT NULL AND status = 'active';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_account_credentials_optional_text_normalized_chk
        CHECK (
          (item_identifier IS NULL
            OR (item_identifier = btrim(item_identifier) AND char_length(item_identifier) >= 1))
          AND (institution_id IS NULL
            OR (institution_id = btrim(institution_id) AND char_length(institution_id) >= 1))
          AND (institution_name IS NULL
            OR (institution_name = btrim(institution_name) AND char_length(institution_name) >= 1))
        ),
      ADD CONSTRAINT bank_account_credentials_tokens_nonempty_chk
        CHECK (
          char_length(encrypted_access_token) >= 1
          AND (encrypted_refresh_token IS NULL OR char_length(encrypted_refresh_token) >= 1)
        ),
      ADD CONSTRAINT bank_account_credentials_expiry_chk
        CHECK (expires_at IS NULL OR expires_at > connected_at);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
