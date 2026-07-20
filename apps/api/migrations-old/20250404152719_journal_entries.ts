import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from '../migrations/utils/db.js';

const tableName = 'journal_entries';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('description', 512).nullable();
    table.specificType('side', 'debit_credit').notNullable();
    table.decimal('amount', 18, 3).notNullable();

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

    table
      .uuid('project_id')
      .nullable()
      .references('id')
      .inTable('projects')
      .onDelete('SET NULL');

    // Composite FK target is ledger_entries(id, fs_date)
    table.uuid('ledger_entry_id').nullable();
    table.date('ledger_entry_fs_date').nullable();

    addStandardColumns(knex, table);
    table.index(['journal_batch_id'], 'journal_entry_batch_idx');
  });

  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT journal_entries_positive_amount_chk CHECK (amount > 0);
  `);

  // Ensure ledger link columns are set together (no half-links)
  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT journal_entries_ledger_link_all_or_nothing_chk
      CHECK (
        (ledger_entry_id IS NULL AND ledger_entry_fs_date IS NULL)
        OR
        (ledger_entry_id IS NOT NULL AND ledger_entry_fs_date IS NOT NULL)
      );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX journal_entries_ledger_link_uniq
      ON ${tableName} (ledger_entry_id, ledger_entry_fs_date)
      WHERE ledger_entry_id IS NOT NULL
        AND ledger_entry_fs_date IS NOT NULL
        AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX journal_entries_active_coa_idx
    ON journal_entries(coa_id)
    WHERE is_deleted = false;
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS journal_entries_active_coa_idx`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
