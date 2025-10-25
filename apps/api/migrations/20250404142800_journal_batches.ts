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

    table.string('code').nullable();
    table.integer('sequence_number').nullable(); //Raw sequence numnber (increment per company when creating journal. KISS)
    table.timestamp('date', { useTz: true }).notNullable();
    table.string('title', 512).notNullable();
    table.string('description').nullable();
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
    table.string('note', 2048).nullable();
    table.jsonb('metadata').nullable();
    addStandardColumns(knex, table);

    table.unique(['company_id', 'sequence_number'], {
      indexName: 'journal_batch_company_id_sequence_number_unique',
    });

    table.index(
      ['status', 'company_id'],
      'journal_batch_status_company_id_idx',
    );
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Create function for sequence_number increment and code generation
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_journal_batch_sequence_number()
    RETURNS TRIGGER AS $$
    DECLARE
      current_year INTEGER;
      yearly_sequence INTEGER;
    BEGIN
      -- Get current year from creation time
      current_year := EXTRACT(YEAR FROM NOW());
      
      -- Calculate sequence number for this year and company
      yearly_sequence := (
        SELECT COALESCE(MAX(sequence_number), 0) + 1
        FROM journal_batches
        WHERE company_id = NEW.company_id
          AND EXTRACT(YEAR FROM created_at) = current_year
      );
      
      -- Always set sequence_number (yearly reset per company)
      NEW.sequence_number := yearly_sequence;
      
      -- Auto-generate code if not provided (but allow manual override)
      IF NEW.code IS NULL THEN
        NEW.code := 'JE-' || current_year || '-' || LPAD(yearly_sequence::text, 4, '0');
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger to set sequence_number and code before insert
  await knex.raw(`
    CREATE TRIGGER trigger_set_journal_batch_sequence_number
    BEFORE INSERT ON journal_batches
    FOR EACH ROW
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
