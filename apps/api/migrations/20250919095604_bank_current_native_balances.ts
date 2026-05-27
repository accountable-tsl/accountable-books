import type { Knex } from 'knex';

const tableName = 'bank_account_current_native_balances';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable('bank_accounts')
      .onDelete('CASCADE');

    table
      .timestamp('as_of_time', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.decimal('native_balance', 18, 3).notNullable().defaultTo(0);

    table.primary(['company_id', 'bank_account_id']);
  });

  // Index for fast balance lookups
  await knex.raw(`
    CREATE INDEX bank_account_current_balances_company_idx
      ON bank_account_current_native_balances (company_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS bank_account_current_balances_company_idx;`,
  );
  await knex.schema.dropTableIfExists(tableName);
}
