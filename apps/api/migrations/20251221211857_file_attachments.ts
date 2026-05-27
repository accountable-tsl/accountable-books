import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'file_attachments';

/**
 * Creates the `file_attachments` table - many-to-many linking between files and transactions.
 * Allows the same file to be attached to multiple transactions/entries.
 *
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    // Link to the file
    table
      .uuid('file_id')
      .notNullable()
      .references('id')
      .inTable('files')
      .onDelete('CASCADE');

    // Attachment target
    table
      .string('source')
      .notNullable()
      .checkIn(['ledger', 'journal', 'bank'])
      .comment('Type of transaction this file is attached to');

    table
      .uuid('transaction_id')
      .notNullable()
      .comment('ID of the transaction (ledger, journal batch, or bank txn)');

    table
      .uuid('entry_id')
      .nullable()
      .comment(
        'ID of the entry (ledger entry or journal entry), null for transaction-level attachments',
      );

    // Who attached it (may differ from who uploaded the file)
    table
      .uuid('attached_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .timestamp('attached_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Standard columns
    addStandardColumns(knex, table);

    table
      .uuid('detached_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });

  // Unique constraint: prevent duplicate attachments (null-safe for entry_id)
  // Uses COALESCE to handle NULL entry_id in the unique index
  await knex.raw(`
    CREATE UNIQUE INDEX file_attachments_unique_link
    ON ${tableName} (file_id, source, transaction_id, COALESCE(entry_id, '00000000-0000-0000-0000-000000000000'))
    WHERE is_deleted = false;
  `);

  // Indexes for common query patterns
  await knex.schema.table(tableName, (table) => {
    table.index(['file_id'], 'file_attachments_file_id_idx');
    table.index(
      ['source', 'transaction_id'],
      'file_attachments_source_txn_idx',
    );
    table.index(
      ['source', 'transaction_id', 'entry_id'],
      'file_attachments_source_txn_entry_idx',
    );
    table.index(['is_deleted'], 'file_attachments_deleted_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
