import type { Knex } from 'knex';

/**
 * GL current balances are a derived read model with one latest reporting
 * currency balance per company-owned chart-of-accounts row. They are rebuilt
 * from daily GL balance snapshots and used for fast account lists, dashboards,
 * and point lookups. Posted ledger entries remain the accounting source of
 * truth.
 */
const schemaName = 'app';
const tableName = 'gl_current_balances';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.uuid('coa_id').notNullable();

    table.date('as_of_date').notNullable();

    table
      .decimal('reporting_currency_balance', 18, 3)
      .notNullable()
      .defaultTo(0);

    table
      .timestamp('calculated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['company_id', 'coa_id']);

    table
      .foreign(['coa_id', 'company_id'], 'gl_current_balances_coa_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Latest derived reporting-currency balance per company COA, rebuilt from GL daily balance snapshots for fast account and dashboard reads.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT gl_current_balances_as_of_date_chk
        CHECK (as_of_date >= DATE '1900-01-01');
  `);

  await knex.raw(`
    CREATE INDEX gl_current_balances_company_idx
      ON ${qualifiedTable} (company_id)
      INCLUDE (coa_id, as_of_date, reporting_currency_balance, calculated_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS "${schemaName}".gl_current_balances_company_idx;`,
  );
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
