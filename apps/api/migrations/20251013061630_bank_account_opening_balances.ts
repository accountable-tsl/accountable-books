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
    table.decimal('amount', 15, 3).notNullable();

    table
      .timestamp('coverage_start', { useTz: true })
      .notNullable()
      .comment('Precise timestamp of first transaction in coverage window');
    table
      .timestamp('coverage_end', { useTz: true })
      .notNullable()
      .comment('Precise timestamp of last transaction in coverage window');

    table
      .enu('origin', ['user_entered', 'system_calculated', 'system_snapshot'], {
        useNative: false,
        enumName: `${tableName}_origin`,
      })
      .notNullable();
    table
      .enu('role', ['baseline', 'checkpoint', 'archived'], {
        useNative: false,
        enumName: `${tableName}_role`,
      })
      .notNullable();

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
    CREATE UNIQUE INDEX ${tableName}_one_baseline
    ON ${tableName} (bank_account_id)
    WHERE role = 'baseline' AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ${tableName}_history
    ON ${tableName} (bank_account_id, created_at DESC)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
  ALTER TABLE ${tableName}
    ADD CONSTRAINT ${tableName}_coverage_order_chk
    CHECK (coverage_start <= coverage_end);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_coverage_order_chk;`,
  );
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_history;`);
  await knex.raw(`DROP INDEX IF EXISTS ${tableName}_one_baseline;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS ${tableName}_origin;`);
  await knex.raw(`DROP TYPE IF EXISTS ${tableName}_role;`);
}
