import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Foreign exchange positions
 * Tracks foreign currency exposure lots. One position per fx transaction per company
 *
 */
const tableName = 'fx_positions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.string('fx_transaction_id').notNullable();

    // Not sure if we need account id since the transaction already carries it
    table
      .uuid('account_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('CASCADE');

    table
      .uuid('foreign_currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('CASCADE');

    table.decimal('open_fx_amount', 18, 3).notNullable();

    table
      .decimal('carrying_rate', 32, 10)
      .notNullable()
      .comment('Last rate use to set carrying value');

    table
      .decimal('carrying_base_amount', 18, 3)
      .notNullable()
      .comment('Base carrying value after last revaluation');

    table
      .enu('state', ['open', 'closed'], {
        enumName: 'fx_position_state',
        useNative: false,
      })
      .notNullable()
      .defaultTo('open');

    table
      .jsonb('metadata')
      .nullable()
      .comment('To track additional data, and history of changes');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(['company_id', 'fx_transaction_id']);
  });

  await knex.raw(`
    CREATE INDEX fxpos_open_idx
      ON fx_positions (company_id, state, foreign_currency_id);
  `);
  await knex.raw(`
    CREATE INDEX fxpos_account_idx
      ON fx_positions (company_id, account_id, state);
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS fxpos_account_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS fxpos_open_idx;`);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
  await knex.raw(`DROP TYPE IF EXISTS fx_position_state`);
}
