import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

// If we had to replay

const statsTable = 'bank_transaction_contact_stats';
const entriesTable = 'bank_transaction_contact_stats_entries';

export async function up(knex: Knex): Promise<void> {
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
      .uuid('bank_transaction_id')
      .notNullable()
      .references('id')
      .inTable('bank_transactions')
      .onDelete('CASCADE');
    table.date('bank_transaction_date').notNullable();
    table.unique(['bank_transaction_id', 'bank_transaction_date']);

    table.decimal('native_amount_abs', 20, 2).notNullable().defaultTo(0);
    table.decimal('reporting_amount_abs', 20, 2).notNullable().defaultTo(0);
    table.string('stats_snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, entriesTable);

  await knex.raw(
    `CREATE INDEX idx_contact_stats_entries_stats ON ${entriesTable}(stats_id, bank_transaction_date) WHERE is_deleted = FALSE`,
  );
  await knex.raw(
    `CREATE INDEX idx_contact_stats_entries_company ON ${entriesTable}(company_id) WHERE is_deleted = FALSE`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_entries_company;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_contact_stats_entries_stats;`);
  await dropUpdateTimestampTrigger(knex, entriesTable);
  await knex.schema.dropTableIfExists(entriesTable);
}
