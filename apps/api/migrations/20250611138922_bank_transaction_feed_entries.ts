import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * One provider-observed transaction identity within one bank account feed.
 * Unique by (feed, provider transaction id). A pure mapping: every entry
 * links a provider transaction id to the canonical bank transaction it was
 * imported as, plus the latest provider observation and evidence. Pending
 * observations and history candidates never get entries; only imported
 * final transactions do.
 */

const schemaName = 'app';
const tableName = 'bank_transaction_feed_entries';
const OBSERVATION_TYPES = ['added', 'modified', 'removed'] as const;

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
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_transactions`)
      .onDelete('RESTRICT')
      .comment('Canonical bank transaction this provider identity maps to');

    table
      .string('observation_type', 16)
      .notNullable()
      .checkIn(
        [...OBSERVATION_TYPES],
        'bank_transaction_feed_entries_observation_type_chk',
      );

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
      .uuid('adopted_from_feed_entry_id')
      .nullable()
      .comment(
        'When this entry adopted a predecessor feed entry after a feed replacement',
      );
    table
      .boolean('replacement_unmatched')
      .notNullable()
      .defaultTo(false)
      .comment(
        'True when imported during replacement reconciliation without a confident predecessor match',
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
      indexName: 'bank_transaction_feed_entries_id_company_uniq',
    });
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
    'Feed-scoped mapping of provider transaction identities to canonical bank_transactions.';
  `);

  await knex.raw(`
    CREATE INDEX bank_transaction_feed_entries_bank_transaction_id_idx
    ON "${schemaName}"."${tableName}" (bank_transaction_id);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_transaction_feed_entries_adopted_from_uniq
    ON "${schemaName}"."${tableName}" (adopted_from_feed_entry_id)
    WHERE adopted_from_feed_entry_id IS NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_feed_entries_adopted_from_company_fk
        FOREIGN KEY (adopted_from_feed_entry_id, company_id)
        REFERENCES "${schemaName}"."${tableName}" (id, company_id)
        ON DELETE RESTRICT,
      ADD CONSTRAINT bank_transaction_feed_entries_adopted_not_self_chk
        CHECK (
          adopted_from_feed_entry_id IS NULL
          OR adopted_from_feed_entry_id <> id
        ),
      ADD CONSTRAINT bank_transaction_feed_entries_provider_txn_id_trimmed_chk
        CHECK (
          provider_transaction_id = btrim(provider_transaction_id)
          AND char_length(provider_transaction_id) >= 1
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
