import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Tracks the collection of pre-connection historical transactions for one
 * bank account feed. One row per feed. While collecting, candidates
 * accumulate in bank_transaction_history_candidates; once the provider
 * reports its history complete the import becomes available for the
 * bookkeeper to select an earlier starting date, which promotes candidates
 * into bank_transactions. Providers that cannot supply history finish as
 * unavailable.
 */

const schemaName = 'app';
const tableName = 'bank_transaction_history_imports';
const STATUSES = [
  'collecting',
  'available',
  'selected',
  'unavailable',
  'failed',
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
      .string('status', 16)
      .notNullable()
      .defaultTo('collecting')
      .checkIn([...STATUSES], 'bank_transaction_history_imports_status_chk');

    table
      .date('earliest_transaction_date')
      .nullable()
      .comment('Earliest candidate transaction date observed so far');
    table
      .date('latest_transaction_date')
      .nullable()
      .comment('Latest candidate transaction date observed so far');
    table.integer('transaction_count').notNullable().defaultTo(0);

    table
      .date('selected_from_date')
      .nullable()
      .comment('Starting date the bookkeeper chose when promoting history');
    table.timestamp('selected_at', { useTz: true }).nullable();
    table
      .uuid('selected_by_id')
      .nullable()
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

    table
      .foreign(
        ['bank_account_feed_id', 'company_id'],
        'bank_transaction_history_imports_feed_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');

    table.unique(['bank_account_feed_id'], {
      indexName: 'bank_transaction_history_imports_feed_uniq',
    });
    table.unique(['id', 'company_id']);
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Per-feed collection state of pre-connection historical bank transactions awaiting bookkeeper selection.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_history_imports_count_chk
        CHECK (transaction_count >= 0),
      ADD CONSTRAINT bank_transaction_history_imports_date_range_chk
        CHECK (
          ((earliest_transaction_date IS NULL) = (latest_transaction_date IS NULL))
          AND (
            earliest_transaction_date IS NULL
            OR earliest_transaction_date <= latest_transaction_date
          )
          AND ((transaction_count = 0) = (earliest_transaction_date IS NULL))
        ),
      ADD CONSTRAINT bank_transaction_history_imports_selection_chk
        CHECK (
          num_nonnulls(selected_from_date, selected_at, selected_by_id) IN (0, 3)
          AND ((status = 'selected') = (selected_from_date IS NOT NULL))
        );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
