import type { Knex } from 'knex';
import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.ts';

const tableName = 'gl_period_balances';

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

    table.integer('fiscal_year').notNullable();
    table.integer('fiscal_period').notNullable();
    table
      .enu('period_type', ['monthly', 'quarterly', 'yearly'], {
        useNative: true,
        existingType: true,
        enumName: 'fiscal_period_type',
      })
      .notNullable()
      .defaultTo('monthly');

    table.date('period_start_date').notNullable();
    table.date('period_end_date').notNullable();

    table.decimal('opening_balance', 15, 3).notNullable().defaultTo(0);
    table.decimal('period_debits', 15, 3).notNullable().defaultTo(0);
    table.decimal('period_credits', 15, 3).notNullable().defaultTo(0);
    table.decimal('closing_balance', 15, 3).notNullable();
    table.integer('transaction_count').notNullable().defaultTo(0);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary([
      'company_id',
      'coa_id',
      'fiscal_year',
      'fiscal_period',
      'period_type',
    ]);

    // FK to fiscal_calendar
    table
      .foreign(['company_id', 'fiscal_year', 'fiscal_period', 'period_type'])
      .references(['company_id', 'fiscal_year', 'period_number', 'period_type'])
      .inTable('fiscal_calendar')
      .onDelete('CASCADE');
  });

  // Index for trial balance queries (scan by period, not by account)
  await knex.raw(`
    CREATE INDEX gl_period_balances_period_lookup_idx
      ON ${tableName} (company_id, fiscal_year, fiscal_period, period_type)
      INCLUDE (opening_balance, period_debits, period_credits, closing_balance);
  `);

  // Constraint: balance math must work
  await knex.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT gl_period_balance_math_check
      CHECK (closing_balance = opening_balance + period_debits - period_credits);
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS gl_period_balances_period_lookup_idx;`);
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS gl_period_balance_math_check;`,
  );
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
