import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'bank_transaction_contact_stats';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.integer('version').notNullable().defaultTo(1); // If we change the aggregation logic, we run a backfill that bumps the version for every row. No pile-up of old rows, just an optimistic concurrency token.
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('contact_id')
      .nullable()
      .comment('NULL when contact is not matched/created yet');

    table
      .string('contact_fingerprint', 256)
      .notNullable()
      .comment('SHA256 hash of normalized contact name for grouping unknowns');

    table
      .string('normalized_name', 256)
      .notNullable()
      .comment('Canonical contact name for display');

    table
      .string('currency_code', 3)
      .notNullable()
      .comment('ISO 4217 currency code (USD, GBP, NGN, etc.)');

    // All-time statistics
    table.integer('total_transactions').notNullable().defaultTo(0);
    table.bigInteger('total_amount_native').notNullable().defaultTo(0);
    table.bigInteger('total_amount_reporting').notNullable().defaultTo(0);
    table.bigInteger('total_sumsq_native').notNullable().defaultTo(0);
    table.bigInteger('total_sumsq_reporting').notNullable().defaultTo(0);
    table.bigInteger('avg_amount_native').notNullable().defaultTo(0);
    table.bigInteger('avg_amount_reporting').notNullable().defaultTo(0);
    table.bigInteger('std_dev_amount_native').notNullable().defaultTo(0);
    table.bigInteger('std_dev_amount_reporting').notNullable().defaultTo(0);

    // Rolling 30-day window (recent behavior, FX-resilient)
    table.integer('rolling_30d_txn_count').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_total_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_total_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_sumsq_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_sumsq_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_avg_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_avg_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_stddev_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_30d_stddev_reporting').notNullable().defaultTo(0);

    // Rolling 90-day window (medium-term trends)
    table.integer('rolling_90d_txn_count').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_total_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_total_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_sumsq_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_sumsq_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_avg_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_avg_reporting').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_stddev_native').notNullable().defaultTo(0);
    table.bigInteger('rolling_90d_stddev_reporting').notNullable().defaultTo(0);

    // Last transaction metadata
    table
      .uuid('last_transaction_id')
      .nullable()
      .references('id')
      .inTable('bank_transactions')
      .onDelete('SET NULL')
      .comment('FK to the last bank transaction included in these statistics');

    table
      .date('last_transaction_date')
      .nullable()
      .comment('Business-date snapshot for the last included transaction');

    table
      .integer('stats_replay_seq')
      .notNullable()
      .defaultTo(0)
      .comment(
        'Incremented whenever we rebuild this row during a replay/backfill so downstream consumers know the context changed',
      );

    table
      .string('stats_snapshot_checksum', 64)
      .nullable()
      .comment(
        'SHA256 (hex) of the last snapshot payload used to dedupe replay output and detect drift',
      );

    table
      .timestamp('snapshot_captured_at', { useTz: true })
      .nullable()
      .comment(
        'When we last captured this row into an EnrichedTransaction snapshot; separate from updated_at for replay audits',
      );

    addStandardColumns(knex, table);

    table
      .foreign(
        ['contact_id', 'company_id'],
        'bank_transaction_contact_stats_contact_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable('contacts')
      .onDelete('RESTRICT');

    // Composite unique constraint
    table.unique([
      'company_id',
      'currency_code',
      'contact_fingerprint',
      'contact_id',
    ]);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Partial unique indexes to prevent collision of unknown contacts with NULL contact_ids
  await knex.raw(`
    CREATE UNIQUE INDEX idx_contact_stats_known
    ON ${tableName}(company_id, currency_code, contact_id, contact_fingerprint)
    WHERE contact_id IS NOT NULL AND is_deleted = FALSE;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_contact_stats_unknown
    ON ${tableName}(company_id, currency_code, contact_fingerprint)
    WHERE contact_id IS NULL AND is_deleted = FALSE;
  `);

  // Query indexes
  await knex.raw(`
    CREATE INDEX idx_contact_stats_company
    ON ${tableName}(company_id)
    WHERE is_deleted = FALSE;
  `);

  await knex.raw(`
    CREATE INDEX idx_contact_stats_company_currency
    ON ${tableName}(company_id, currency_code)
    WHERE is_deleted = FALSE;
  `);

  await knex.raw(`
    CREATE INDEX idx_contact_stats_fingerprint
    ON ${tableName}(contact_fingerprint)
    WHERE is_deleted = FALSE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_fingerprint;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_company_currency;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_unknown;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_known;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
