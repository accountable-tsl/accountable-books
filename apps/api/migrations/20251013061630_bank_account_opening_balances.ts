import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'bank_account_opening_balances';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('bank_account_id')
      .notNullable()
      .references('id')
      .inTable('bank_accounts')
      .onDelete('CASCADE');

    table
      .date('as_of_date')
      .notNullable()
      .comment(
        'Balance as of end of day (opening balance for transactions starting the next day)',
      );
    table.decimal('amount', 32, 10).notNullable();

    table.date('coverage_start').notNullable();
    table.date('coverage_end').notNullable();

    table
      .enu('origin', ['user_conversion', 'system_calculated'], {
        useNative: false,
        enumName: `${tableName}_origin`,
      })
      .notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);

    table
      .uuid('journal_batch_id')
      .nullable()
      .references('id')
      .inTable('journal_batches')
      .onDelete('SET NULL');

    table.jsonb('metadata').nullable();
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

    addStandardColumns(knex, table);
  });
  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE UNIQUE INDEX ${tableName}_one_active
    ON ${tableName} (bank_account_id)
    WHERE is_active = true AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ${tableName}_history
    ON ${tableName} (bank_account_id, created_at DESC)
    WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_history;`);
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_one_active;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS ${tableName}_origin;`);
}
