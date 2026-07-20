import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from '../migrations/utils/db.js';
import {
  createTrgmIndexes,
  dropTrgmIndexes,
} from '../migrations/utils/trgmIndexes.js';

const tableName = 'ledger_transactions';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.timestamp('date', { useTz: true }).notNullable();
    table
      .string('transaction_source')
      .checkIn(
        ['manual_journal', 'bank_transaction'],
        'ledger_transaction_source',
      )
      .notNullable();

    table
      .specificType('categorization_source', 'txn_categorization_source')
      .notNullable();
    table.boolean('is_trainable').notNullable().defaultTo(false);
    table.string('description', 512).nullable();
    table.string('reference').nullable();
    table.string('note').nullable();

    table.uuid('contact_id').nullable().references('id').inTable('contacts');
    table.specificType('contact_type', 'contact_type').nullable();

    table.uuid('source_transaction_id').nullable();
    table.date('source_transaction_date').nullable();
    table.decimal('source_transaction_amount', 18, 3).nullable(); // Native amount where txn is from a bank transaction
    table
      .uuid('source_transaction_currency_id')
      .nullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');
    // table.uuid('bank_transaction_id').nullable();
    // table.date('bank_transaction_date').nullable();

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies');

    // Foreign key to categorization_candidates will be added in a later migration
    // after the categorization_candidates table is created
    table.uuid('categorization_candidate_id').nullable();

    // table.boolean('human_reviewed').notNullable().defaultTo(false);
    // table.uuid('reviewed_by_id').nullable().references('id').inTable('users');
    // table.text('review_notes').nullable();

    table.jsonb('metadata').nullable();

    table.uuid('created_by_id').notNullable().references('id').inTable('users');
    table.uuid('updated_by_id').nullable().references('id').inTable('users');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Partial unique index: ensure uniqueness only for non-deleted records with source_transaction_id
  await knex.raw(`
    CREATE UNIQUE INDEX ${tableName}_company_source_txn_unique
    ON ${tableName} (company_id, source_transaction_id, source_transaction_date)
    WHERE source_transaction_id IS NOT NULL AND is_deleted = false;
  `);

  await createTrgmIndexes(knex, tableName, [
    'description',
    'reference',
    'note',
  ]);

  // Bank transactions must have the three fields
  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT bank_transaction_requires_fields
    CHECK (
      transaction_source != 'bank_transaction'
      OR (
        source_transaction_id IS NOT NULL
        AND source_transaction_date IS NOT NULL
        AND source_transaction_amount IS NOT NULL
      )
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS ${tableName}_company_source_txn_unique;`,
  );
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
