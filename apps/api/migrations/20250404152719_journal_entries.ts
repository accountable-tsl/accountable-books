import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'journal_entries';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('description', 512).nullable();
    table.specificType('side', 'debit_credit').notNullable();
    table.decimal('amount', 15, 3).notNullable();

    table
      .uuid('journal_batch_id')
      .notNullable()
      .references('id')
      .inTable('journal_batches')
      .onDelete('CASCADE');

    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('RESTRICT');

    table.uuid('ledger_entry_id').nullable();
    table.date('ledger_entry_fs_date').nullable();

    addStandardColumns(knex, table);
    table.index(['journal_batch_id'], 'journal_entry_batch_idx');
    table.unique(['ledger_entry_id', 'ledger_entry_fs_date']);
  });

  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT journal_entries_positive_amount_chk CHECK (amount > 0);
  `);
  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
