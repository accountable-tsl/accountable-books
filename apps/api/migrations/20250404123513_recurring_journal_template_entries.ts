import type { Knex } from 'knex';

const tableName = 'recurring_journal_template_entries';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('description', 512).notNullable();
    table.decimal('amount', 32, 10).notNullable();
    table.specificType('transaction_side', 'debit_credit').notNullable();
    table.string('placeholder_description_var').nullable();
    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('RESTRICT');
    table
      .uuid('template_id')
      .notNullable()
      .references('id')
      .inTable('recurring_journal_templates')
      .onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
