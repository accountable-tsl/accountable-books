import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Bank account feeds bind one durable bank account to one bank connection.
 * The feed owns the provider account identity and that account's sync
 * checkpoint. Active state is derived: a feed is active while revoked_at is
 * null.
 */

const schemaName = 'app';
const tableName = 'bank_account_feeds';
const REVOCATION_ORIGINS = ['client', 'provider'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_accounts`)
      .onDelete('RESTRICT');

    table
      .uuid('bank_connection_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_connections`)
      .onDelete('RESTRICT');

    table
      .string('provider_account_id', 256)
      .notNullable()
      .comment('Provider-specific account identifier within the connection');

    table
      .jsonb('provider_snapshot')
      .nullable()
      .comment('Sanitized provider account snapshot');
    table.integer('provider_snapshot_version').nullable();
    table
      .timestamp('provider_snapshot_captured_at', { useTz: true })
      .nullable();

    table
      .date('sync_from_date')
      .nullable()
      .comment('Earliest transaction date this feed should import');
    table
      .text('sync_from_timezone')
      .notNullable()
      .defaultTo('Etc/UTC')
      .comment('IANA timezone used when sync_from_date was set');
    table
      .text('sync_cursor')
      .nullable()
      .comment('Opaque provider checkpoint for this feed transaction stream');
    table.timestamp('initial_sync_completed_at', { useTz: true }).nullable();
    table.timestamp('last_successful_sync_at', { useTz: true }).nullable();

    table
      .integer('state_version')
      .notNullable()
      .defaultTo(1)
      .comment('Compare-and-swap guard; bumped on lifecycle/secret changes');

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

    table.timestamp('revoked_at', { useTz: true }).nullable();
    table
      .uuid('revoked_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');
    table
      .string('revocation_origin', 16)
      .nullable()
      .checkIn(
        [...REVOCATION_ORIGINS],
        'bank_account_feeds_revocation_origin_chk',
      );
    table.string('revocation_reason', 512).nullable();

    table
      .uuid('replaces_bank_account_feed_id')
      .nullable()
      .comment(
        'When this feed replaces a retired feed after a provider item change',
      );
    table
      .timestamp('replacement_reconciliation_completed_at', { useTz: true })
      .nullable()
      .comment(
        'When predecessor matching finished for a replacement feed (after initial sync)',
      );

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['id', 'company_id'], {
      indexName: 'bank_account_feeds_id_company_uniq',
    });
    table
      .foreign(
        ['bank_account_id', 'company_id'],
        'bank_account_feeds_account_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_accounts`)
      .onDelete('RESTRICT');
    table
      .foreign(
        ['bank_connection_id', 'company_id'],
        'bank_account_feeds_connection_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_connections`)
      .onDelete('RESTRICT');

    table.index(['bank_account_id'], 'bank_account_feeds_bank_account_id_idx');
    table.index(
      ['bank_connection_id'],
      'bank_account_feeds_bank_connection_id_idx',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Binds one bank account to one bank connection. Owns provider account identity and the per-account sync checkpoint. Active = revoked_at IS NULL.';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_account_feeds_active_account_uniq
    ON "${schemaName}"."${tableName}" (bank_account_id)
    WHERE revoked_at IS NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_account_feeds_connection_provider_account_uniq
    ON "${schemaName}"."${tableName}" (bank_connection_id, provider_account_id);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_account_feeds_replaces_feed_uniq
    ON "${schemaName}"."${tableName}" (replaces_bank_account_feed_id)
    WHERE replaces_bank_account_feed_id IS NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_account_feeds_replaces_feed_company_fk
        FOREIGN KEY (replaces_bank_account_feed_id, company_id)
        REFERENCES "${schemaName}"."${tableName}" (id, company_id)
        ON DELETE RESTRICT;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_account_feeds_provider_account_id_trimmed_chk
        CHECK (
          provider_account_id = btrim(provider_account_id)
          AND char_length(provider_account_id) >= 1
        ),
      ADD CONSTRAINT bank_account_feeds_replaces_not_self_chk
        CHECK (
          replaces_bank_account_feed_id IS NULL
          OR replaces_bank_account_feed_id <> id
        ),
      ADD CONSTRAINT bank_account_feeds_revocation_chk
        CHECK (
          (
            revoked_at IS NULL
            AND revoked_by_id IS NULL
            AND revocation_origin IS NULL
            AND revocation_reason IS NULL
          )
          OR
          (revoked_at IS NOT NULL AND revocation_origin IS NOT NULL)
        ),
      ADD CONSTRAINT bank_account_feeds_revocation_reason_trimmed_chk
        CHECK (
          revocation_reason IS NULL
          OR (revocation_reason = btrim(revocation_reason) AND char_length(revocation_reason) >= 1)
        ),
      ADD CONSTRAINT bank_account_feeds_provider_snapshot_chk
        CHECK (
          (
            provider_snapshot IS NULL
            AND provider_snapshot_version IS NULL
            AND provider_snapshot_captured_at IS NULL
          )
          OR
          (
            provider_snapshot IS NOT NULL
            AND provider_snapshot_version IS NOT NULL
            AND provider_snapshot_captured_at IS NOT NULL
          )
        ),
      ADD CONSTRAINT bank_account_feeds_state_version_chk
        CHECK (state_version >= 1),
      ADD CONSTRAINT bank_account_feeds_sync_from_timezone_chk
        CHECK (
          sync_from_timezone = btrim(sync_from_timezone)
          AND char_length(sync_from_timezone) >= 1
          AND "${schemaName}".is_valid_iana_timezone(sync_from_timezone)
        );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
