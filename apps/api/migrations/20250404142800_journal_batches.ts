import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'journal_batches';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.integer('sequence_number').nullable(); //Raw sequence numnber (increment per company when creating journal. KISS)
    table.timestamp('date', { useTz: true }).notNullable();
    table.string('description', 512).notNullable();
    table.string('note', 1000).nullable();
    table.specificType('status', 'journal_status').defaultTo('draft').notNullable();

    table
      .uuid('generated_from_template_id')
      .nullable()
      .references('id')
      .inTable('recurring_journal_templates');

    table
      .uuid('ledger_transaction_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('RESTRICT');

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
    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.uuid('reversed_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('reversed_at', { useTz: true }).nullable();
    table.specificType('reversal_reason', 'journal_reversal_reason').nullable();

    addStandardColumns(knex, table);

    table.unique(['company_id', 'sequence_number'], {
      indexName: 'journal_batch_company_id_sequence_number_unique',
    });

    table.index(['status', 'company_id'], 'journal_batch_status_company_id_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Create function for sequence_number increment
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_journal_batch_sequence_number()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.sequence_number := (
        SELECT COALESCE(MAX(sequence_number), 0) + 1
        FROM journal_batches
        WHERE company_id = NEW.company_id
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger to set sequence_number before insert
  await knex.raw(`
    CREATE TRIGGER trigger_set_journal_batch_sequence_number
    BEFORE INSERT ON journal_batches
    FOR EACH ROW
    WHEN (NEW.sequence_number IS NULL)
    EXECUTE FUNCTION set_journal_batch_sequence_number();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    'DROP TRIGGER IF EXISTS trigger_set_journal_batch_sequence_number ON journal_batches;',
  );
  await knex.raw('DROP FUNCTION IF EXISTS set_journal_batch_sequence_number;');
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
