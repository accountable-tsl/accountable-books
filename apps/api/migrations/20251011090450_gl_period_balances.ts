import type { Knex } from 'knex';

/**
 * GL period balances are derived fiscal-period summaries per company COA. They
 * are rebuilt from GL daily balance snapshots and power trial balance,
 * financial statements, period comparisons, and other period-based reporting.
 * Posted ledger entries remain the accounting source of truth.
 */
const schemaName = 'app';
const tableName = 'gl_period_balances';
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
    table.uuid('fiscal_calendar_id').notNullable();

    table.decimal('opening_balance', 18, 3).notNullable().defaultTo(0);
    table.decimal('period_debits', 18, 3).notNullable().defaultTo(0);
    table.decimal('period_credits', 18, 3).notNullable().defaultTo(0);
    table.decimal('closing_balance', 18, 3).notNullable().defaultTo(0);
    table.integer('transaction_count').notNullable().defaultTo(0);

    table
      .timestamp('calculated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['company_id', 'coa_id', 'fiscal_calendar_id'], {
      constraintName: 'gl_period_balances_pk',
    });

    table
      .foreign(['coa_id', 'company_id'], 'gl_period_balances_coa_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table
      .foreign(
        ['fiscal_calendar_id', 'company_id'],
        'gl_period_balances_fiscal_calendar_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.fiscal_calendar`)
      .onDelete('RESTRICT');
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Derived fiscal-period opening, movement, and closing reporting-currency balances per company COA, rebuilt from GL daily balance snapshots for trial balance and financial statement reporting.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT gl_period_balance_math_chk
        CHECK (closing_balance = opening_balance + period_debits - period_credits),
      ADD CONSTRAINT gl_period_balance_nonnegative_activity_chk
        CHECK (
          period_debits >= 0
          AND period_credits >= 0
          AND transaction_count >= 0
        );
  `);

  await knex.raw(`
    CREATE INDEX gl_period_balances_period_lookup_idx
      ON ${qualifiedTable} (company_id, fiscal_calendar_id)
      INCLUDE (
        coa_id,
        opening_balance,
        period_debits,
        period_credits,
        closing_balance,
        transaction_count,
        calculated_at
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `DROP INDEX IF EXISTS "${schemaName}".gl_period_balances_period_lookup_idx;`,
  );

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
