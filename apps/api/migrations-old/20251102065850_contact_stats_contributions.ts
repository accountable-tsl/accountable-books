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
    table.uuid('contact_id').nullable();
    table.string('contact_fingerprint', 256).notNullable();
    table.string('currency_code', 3).notNullable();

    table.uuid('bank_transaction_id').notNullable();
    table.date('bank_transaction_date').notNullable();
    table.unique(['bank_transaction_id']);

    table.decimal('native_amount_abs', 20, 2).notNullable().defaultTo(0);
    table.decimal('reporting_amount_abs', 20, 2).notNullable().defaultTo(0);
    table.string('stats_snapshot_checksum', 64).nullable();
    table.integer('stats_replay_seq').notNullable().defaultTo(0);
    addStandardColumns(knex, table);

    table
      .foreign(
        ['contact_id', 'company_id'],
        'bank_transaction_contact_stats_entries_contact_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable('contacts')
      .onDelete('RESTRICT');
  });

  await createUpdateTimestampTrigger(knex, entriesTable);

  // The date remains because rolling stats query it directly.
  await knex.raw(`
    ALTER TABLE ${entriesTable}
    ADD CONSTRAINT bank_transaction_contact_stats_entries_bank_transaction_id_foreign
    FOREIGN KEY (bank_transaction_id)
    REFERENCES bank_transactions (id)
    ON DELETE CASCADE;
  `);

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
