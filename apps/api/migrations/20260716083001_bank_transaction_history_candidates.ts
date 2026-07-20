import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Finalized provider transactions dated before the feed's accepted starting
 * date (sync_from_date), quarantined until the bookkeeper selects an earlier
 * date. Rows are temporary: promotion moves them into bank_transactions and
 * deletes them. Candidates never touch bank_transaction_feed_entries, the
 * ledger, or balances; their only identity is (feed, provider transaction id).
 */

const schemaName = 'app';
const tableName = 'bank_transaction_history_candidates';

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
      .uuid('supersedes_bank_transaction_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_transactions`)
      .onDelete('SET NULL')
      .comment(
        'When set, this candidate replaces a previously imported bank_transaction (boundary-crossing correction)',
      );

    table.date('transaction_date').notNullable();
    table.timestamp('transaction_at', { useTz: true }).notNullable();
    table.decimal('amount', 18, 4).notNullable();

    table.text('description').nullable();
    table.text('payee').nullable();
    table.text('additional_notes').nullable();

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
        'bank_transaction_history_candidates_feed_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');

    table.unique(['bank_account_feed_id', 'provider_transaction_id'], {
      indexName: 'bank_transaction_history_candidates_feed_provider_txn_uniq',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Quarantined pre-connection provider transactions awaiting bookkeeper promotion into bank_transactions.';
  `);

  await knex.raw(`
    CREATE INDEX bank_transaction_history_candidates_feed_date_idx
    ON "${schemaName}"."${tableName}" (bank_account_feed_id, transaction_date);
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_history_candidates_provider_txn_trimmed_chk
        CHECK (
          provider_transaction_id = btrim(provider_transaction_id)
          AND char_length(provider_transaction_id) >= 1
        ),
      ADD CONSTRAINT bank_transaction_history_candidates_nonzero_amount_chk
        CHECK (amount <> 0),
      ADD CONSTRAINT bank_transaction_history_candidates_text_trimmed_chk
        CHECK (
          (description IS NULL OR (description = btrim(description) AND char_length(description) >= 1))
          AND (payee IS NULL OR (payee = btrim(payee) AND char_length(payee) >= 1))
          AND (additional_notes IS NULL OR (additional_notes = btrim(additional_notes) AND char_length(additional_notes) >= 1))
        ),
      ADD CONSTRAINT bank_transaction_history_candidates_evidence_version_chk
        CHECK (provider_evidence_schema_version >= 1);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
