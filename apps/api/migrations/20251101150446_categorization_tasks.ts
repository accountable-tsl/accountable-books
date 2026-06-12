import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'categorization_tasks';

export async function up(knex: Knex): Promise<void> {
  // Create categorization_tasks table
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('bank_transaction_id')
      .notNullable()
      .comment('FK to bank_transactions');

    table
      .date('bank_transaction_date')
      .notNullable()
      .comment('Transaction date snapshot used by categorization workflows');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.unique(['bank_transaction_id']);

    table
      .jsonb('enriched_transaction')
      .notNullable()
      .comment('Full EnrichedTransaction snapshot with all features');

    table
      .string('enrichment_version', 30)
      .notNullable()
      .comment('Schema version for tracking enrichment evolution');
    table
      .enu('source', ['ingestion', 'backfill', 'manual'], {
        useNative: false,
        enumName: 'categorization_task_source',
      })
      .notNullable()
      .comment('Trigger source: ingestion, backfill, or manual');

    table
      .string('checksum', 64)
      .nullable()
      .comment('SHA256 hash for change detection');

    table.jsonb('metadata').nullable();

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Transaction identity is the globally unique bank transaction id.
  await knex.raw(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT fk_categorization_tasks_bank_transaction
      FOREIGN KEY (bank_transaction_id)
      REFERENCES bank_transactions(id)
      ON DELETE CASCADE;
    `);

  // Create indexes (idempotent - IF NOT EXISTS)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cat_tasks_company
    ON ${tableName}(company_id)
    WHERE is_deleted = FALSE;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cat_tasks_bank_txn
    ON ${tableName}(bank_transaction_id)
    WHERE is_deleted = FALSE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_tasks_bank_txn;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_tasks_status;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cat_tasks_company;`);
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS fk_categorization_tasks_bank_transaction;`,
  );
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS categorization_task_source;`);
  await knex.raw(`DROP TYPE IF EXISTS categorization_task_status;`);
}
