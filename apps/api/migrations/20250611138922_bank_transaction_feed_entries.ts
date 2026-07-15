import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * One provider-observed transaction identity within one bank account feed.
 * Unique by (feed, provider transaction id). An entry either resolves to a
 * canonical bank transaction or remains unresolved. awaiting_posted is for
 * provider-pending observations that are not yet eligible for canonical
 * import.
 */

const schemaName = 'app';
const tableName = 'bank_transaction_feed_entries';
const OBSERVATION_TYPES = ['added', 'modified', 'removed', 'pending'] as const;
const RESOLUTION_STATES = [
  'resolved',
  'unresolved',
  'awaiting_posted',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('bank_account_feed_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .string('provider_transaction_id', 256)
      .notNullable()
      .comment(
        'Provider transaction identifier; feed-local unless the provider contract guarantees more',
      );

    table
      .uuid('bank_transaction_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_transactions`)
      .onDelete('RESTRICT')
      .comment('Canonical bank transaction this observation resolved to');

    table
      .string('observation_type', 16)
      .notNullable()
      .checkIn(
        [...OBSERVATION_TYPES],
        'bank_transaction_feed_entries_observation_type_chk',
      );

    table
      .string('resolution_state', 32)
      .notNullable()
      .checkIn(
        [...RESOLUTION_STATES],
        'bank_transaction_feed_entries_resolution_state_chk',
      );
    table.string('resolution_reason', 512).nullable();

    table
      .jsonb('provider_evidence')
      .notNullable()
      .comment('Sanitized provider transaction observation');
    table.integer('provider_evidence_schema_version').notNullable();
    table
      .timestamp('observed_at', { useTz: true })
      .notNullable()
      .comment('When the provider observation was received');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign(
        ['bank_account_feed_id', 'company_id'],
        'bank_transaction_feed_entries_feed_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');
    table
      .foreign(
        ['bank_transaction_id', 'company_id'],
        'bank_transaction_feed_entries_transaction_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_transactions`)
      .onDelete('RESTRICT');

    table.unique(['bank_account_feed_id', 'provider_transaction_id'], {
      indexName: 'bank_transaction_feed_entries_feed_provider_txn_uniq',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Feed-scoped provider transaction identities and their resolution to canonical bank_transactions.';
  `);

  await knex.raw(`
    CREATE INDEX bank_transaction_feed_entries_bank_transaction_id_idx
    ON "${schemaName}"."${tableName}" (bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_feed_entries_provider_txn_id_trimmed_chk
        CHECK (
          provider_transaction_id = btrim(provider_transaction_id)
          AND char_length(provider_transaction_id) >= 1
        ),
      ADD CONSTRAINT bank_transaction_feed_entries_resolved_link_chk
        CHECK (
          (resolution_state = 'resolved' AND bank_transaction_id IS NOT NULL)
          OR (resolution_state != 'resolved' AND bank_transaction_id IS NULL)
        ),
      ADD CONSTRAINT bank_transaction_feed_entries_optional_text_trimmed_chk
        CHECK (
          resolution_reason IS NULL
          OR (
            resolution_reason = btrim(resolution_reason)
            AND char_length(resolution_reason) >= 1
          )
        ),
      ADD CONSTRAINT bank_transaction_feed_entries_evidence_version_chk
        CHECK (provider_evidence_schema_version >= 1);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
