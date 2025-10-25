import type { Knex } from 'knex';
import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'bank_account_daily_native_snapshots';

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

    table.date('day').notNullable();

    // all in native currency of the bank account
    table.decimal('opening_balance', 32, 10).notNullable().defaultTo(0);
    table.decimal('money_out', 32, 10).notNullable().defaultTo(0); // Total money out
    table.decimal('money_in', 32, 10).notNullable().defaultTo(0); // Total money in
    table.decimal('closing_balance', 32, 10).notNullable().defaultTo(0);
    table.integer('transaction_count').notNullable().defaultTo(0);

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['company_id', 'bank_account_id', 'day']);
  });

  // Indexes for efficient balance queries
  await knex.raw(`
    CREATE INDEX bank_account_daily_snapshots_company_account_idx
      ON ${tableName} (company_id, bank_account_id, day DESC);
  `);

  await knex.raw(`
    CREATE INDEX bank_account_daily_snapshots_company_day_idx
      ON ${tableName} (company_id, day DESC);
  `);

  await knex.raw(`
    ALTER TABLE bank_account_daily_native_snapshots
      ADD CONSTRAINT bank_daily_balance_math_check
      CHECK (closing_balance = opening_balance - money_out + money_in);
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE bank_account_daily_native_snapshots DROP CONSTRAINT IF EXISTS bank_daily_balance_math_check;`,
  );

  await knex.raw(
    `DROP INDEX IF EXISTS bank_account_daily_snapshots_company_day_idx;`,
  );
  await knex.raw(
    `DROP INDEX IF EXISTS bank_account_daily_snapshots_company_account_idx;`,
  );
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
