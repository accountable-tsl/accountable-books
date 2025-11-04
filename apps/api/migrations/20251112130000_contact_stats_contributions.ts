import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const statsTable = 'bank_transaction_contact_stats';
const entriesTable = 'bank_transaction_contact_stats_entries';
const replaysTable = 'contact_stats_replays';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(statsTable, (table) => {
    table.string('stats_snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    table.timestamp('snapshot_captured_at', { useTz: true }).nullable();
  });

  await knex.schema.createTable(entriesTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('stats_id')
      .notNullable()
      .references('id')
      .inTable(statsTable)
      .onDelete('CASCADE');
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.string('contact_fingerprint', 256).notNullable();
    table.string('currency_code', 3).notNullable();
    table
      .uuid('transaction_id')
      .notNullable()
      .references('id')
      .inTable('bank_transactions')
      .onDelete('CASCADE');
    table.date('transaction_date').notNullable();
    table.decimal('amount_native_abs', 20, 2).notNullable().defaultTo(0);
    table.decimal('amount_reporting_abs', 20, 2).notNullable().defaultTo(0);
    table.string('snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    addStandardColumns(knex, table);
  });

  await knex.schema.createTable(replaysTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');
    table.string('contact_fingerprint', 256).notNullable();
    table.string('currency_code', 3).notNullable();
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.text('triggered_by').notNullable();
    table.text('replay_reason').nullable();
    table.string('previous_snapshot_checksum', 64).nullable();
    table.string('new_snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, entriesTable);
  await createUpdateTimestampTrigger(knex, replaysTable);

  await knex.raw(
    `CREATE UNIQUE INDEX idx_contact_stats_entries_txn ON ${entriesTable}(transaction_id) WHERE is_deleted = FALSE`,
  );
  await knex.raw(
    `CREATE INDEX idx_contact_stats_entries_stats ON ${entriesTable}(stats_id, transaction_date) WHERE is_deleted = FALSE`,
  );
  await knex.raw(
    `CREATE INDEX idx_contact_stats_entries_company ON ${entriesTable}(company_id) WHERE is_deleted = FALSE`,
  );
  await knex.raw(
    `CREATE INDEX idx_contact_stats_replays_company ON ${replaysTable}(company_id, contact_fingerprint) WHERE is_deleted = FALSE`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_replays_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_entries_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_entries_stats;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_entries_txn;`);
  await knex.raw(`
    ALTER TABLE ${entriesTable}
    DROP CONSTRAINT IF EXISTS bank_transaction_contact_stats_entries_stats_id_foreign;
  `);
  await dropUpdateTimestampTrigger(knex, replaysTable);
  await dropUpdateTimestampTrigger(knex, entriesTable);
  await knex.schema.dropTableIfExists(replaysTable);
  await knex.schema.dropTableIfExists(entriesTable);
  await knex.schema.alterTable(statsTable, (table) => {
    table.dropColumn('snapshot_captured_at');
    table.dropColumn('stats_replay_seq');
    table.dropColumn('stats_snapshot_checksum');
  });
}
