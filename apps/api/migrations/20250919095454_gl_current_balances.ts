import type { Knex } from 'knex';

const tableName = 'gl_current_balances';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('CASCADE');

    table
      .timestamp('as_of_time', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .decimal('reporting_currency_balance', 32, 10)
      .notNullable()
      .defaultTo(0);

    table.primary(['company_id', 'coa_id']);
  });

  // Index for fast balance lookups
  await knex.raw(`
    CREATE INDEX gl_current_balances_company_idx
      ON gl_current_balances (company_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS gl_current_balances_company_idx;`);
  await knex.schema.dropTableIfExists(tableName);
}
