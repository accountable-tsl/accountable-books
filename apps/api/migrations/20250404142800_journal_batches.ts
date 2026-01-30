import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

const tableName = 'journal_batches';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.date('sequence_month').nullable(); // first day of month for sequencing
    table.integer('sequence_number').nullable();

    table.string('reference').nullable(); // User defined / null / JE-YYYYMM-NNNN (sequence bucket + sequence number) e.g JE-202601-0007

    table.date('date').notNullable();
    table.string('title', 512).notNullable();
    table.text('description').nullable();
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('RESTRICT');
    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');
    table.decimal('exchange_rate', 32, 10).notNullable().defaultTo(1.0);
    table
      .specificType('status', 'journal_status')
      .defaultTo('draft')
      .notNullable();

    table.boolean('is_recurring').notNullable().defaultTo(false);
    table
      .uuid('recurring_template_id')
      .nullable()
      .references('id')
      .inTable('recurring_journal_templates');

    table
      .uuid('ledger_transaction_id')
      .nullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('SET NULL');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('reversed_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reversed_at', { useTz: true }).nullable();
    table.specificType('reversal_reason', 'journal_reversal_reason').nullable();

    table.timestamp('auto_reversal_date', { useTz: true }).nullable();
    table
      .uuid('reversal_journal_id')
      .nullable()
      .references('id')
      .inTable('journal_batches')
      .onDelete('SET NULL');
    table
      .uuid('original_journal_id')
      .nullable()
      .references('id')
      .inTable('journal_batches')
      .onDelete('SET NULL');

    table.timestamp('voided_at', { useTz: true }).nullable();

    table.string('note', 2048).nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);

    table.index(
      ['status', 'company_id'],
      'journal_batch_status_company_id_idx',
    );
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Additional indexes for manual journals
  await knex.schema.alterTable(tableName, (table) => {
    // List queries sorted by date
    table.index(['company_id', 'date'], 'journal_batch_company_date_desc_idx');

    // Filtered list queries (status + date)
    table.index(
      ['company_id', 'status', 'date'],
      'journal_batch_company_status_date_desc_idx',
    );
  });

  // Partial index for auto-reversal job
  await knex.raw(`
    CREATE INDEX journal_batch_auto_reversal_idx
      ON ${tableName} (company_id, auto_reversal_date)
      WHERE auto_reversal_date IS NOT NULL
        AND status = 'posted'
        AND reversed_at IS NULL
        AND reversal_journal_id IS NULL
        AND is_deleted = false;
  `);

  // Unique posted sequence per company per month
  await knex.raw(`
     CREATE UNIQUE INDEX journal_batch_company_month_seq_unique
       ON ${tableName} (company_id, sequence_month, sequence_number)
       WHERE reference IS NOT NULL
         AND is_deleted = false;
   `);

  // Unique reference per company (so JE-YYYYMM-NNNN can't collide)
  await knex.raw(`
     CREATE UNIQUE INDEX journal_batch_company_reference_unique
       ON ${tableName} (company_id, reference)
       WHERE reference IS NOT NULL
         AND is_deleted = false;
   `);

  // Partial unique index for recurring journal idempotency
  await knex.raw(`
    CREATE UNIQUE INDEX journal_batch_recurring_idempotency_idx
      ON ${tableName} (recurring_template_id, date)
      WHERE is_recurring = true
        AND is_deleted = false;
  `);

  await knex.raw(`
    ALTER TABLE journal_batches
    ADD CONSTRAINT journal_batches_sequence_month_first_day_chk
    CHECK (
      sequence_month IS NULL
      OR sequence_month = date_trunc('month', sequence_month)::date
    );
  `);

  await createTrgmIndexes(knex, tableName, [
    'reference',
    'title',
    'description',
    'note',
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
