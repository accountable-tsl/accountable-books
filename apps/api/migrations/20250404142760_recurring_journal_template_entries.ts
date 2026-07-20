import type { Knex } from 'knex';

/**
 * Template entries are the debit/credit line items for a recurring journal
 * template. They are subordinate to the template and replaced in full
 * when the template is edited (delete-all + re-insert).
 */

const schemaName = 'app';
const tableName = 'recurring_journal_template_entries';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.uuid('company_id').notNullable();
    table.uuid('template_id').notNullable();
    table.integer('line_number').notNullable();

    table.uuid('coa_id').notNullable();
    table.string('description', 512).notNullable();
    table.decimal('amount', 18, 3).notNullable();
    table
      .specificType('transaction_side', `"${schemaName}"."debit_credit"`)
      .notNullable();

    // Composite FKs - tenant isolation
    table
      .foreign(['template_id', 'company_id'], 'rjte_template_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.recurring_journal_templates`)
      .onDelete('CASCADE');

    table
      .foreign(['coa_id', 'company_id'], 'rjte_coa_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table.unique(['template_id', 'line_number']);
    table.index(['company_id', 'coa_id'], 'rjte_company_coa_idx');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
      'Debit and credit line definitions for recurring journal templates. Entries are tenant-scoped through company_id and ordered by line_number.';

    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT rjte_line_number_positive_chk CHECK (line_number > 0),
      ADD CONSTRAINT rjte_description_trimmed_chk CHECK (
        description = btrim(description) AND char_length(description) >= 1
      ),
      ADD CONSTRAINT rjte_amount_positive_chk CHECK (amount > 0);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
