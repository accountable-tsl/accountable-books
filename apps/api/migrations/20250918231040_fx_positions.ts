import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * FX positions are the current-state register for tracked foreign-currency
 * monetary exposure. Positions are updated as ledger activity changes exposure;
 * append-only lifecycle history lives in fx_position_movements.
 */
const schemaName = 'app';
const tableName = 'fx_positions';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const FX_POSITION_STATES = ['open', 'closed'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.string('fx_transaction_id', 128).notNullable();

    table
      .uuid('account_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table
      .uuid('foreign_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table.decimal('open_fx_amount', 18, 3).notNullable();

    table
      .decimal('carrying_rate', 32, 10)
      .notNullable()
      .comment('Last rate used to set carrying value');

    table
      .decimal('carrying_base_amount', 18, 3)
      .notNullable()
      .comment('Base carrying value after last revaluation');

    table
      .string('state', 16)
      .notNullable()
      .defaultTo('open')
      .checkIn([...FX_POSITION_STATES], 'fx_positions_state_chk');

    table
      .jsonb('metadata')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`))
      .comment('Additional position metadata and derived context');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Enables tenant-scoped composite FKs from fx_position_movements.
    table.unique(['id', 'company_id'], {
      indexName: 'fx_positions_id_company_id_unique',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Current-state register for foreign-currency monetary exposure positions derived from posted ledger entries.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT fx_positions_identity_unique
        UNIQUE (company_id, fx_transaction_id, account_id, foreign_currency_id),
      ADD CONSTRAINT fx_positions_transaction_id_trimmed_chk
        CHECK (
          fx_transaction_id = btrim(fx_transaction_id)
          AND char_length(fx_transaction_id) >= 1
        ),
      ADD CONSTRAINT fx_positions_carrying_rate_positive_chk
        CHECK (carrying_rate > 0),
      ADD CONSTRAINT fx_positions_state_amount_chk
        CHECK (
          (state = 'open' AND open_fx_amount <> 0)
          OR (state = 'closed' AND open_fx_amount = 0)
        );
  `);

  await knex.raw(`
    CREATE INDEX fx_positions_open_currency_idx
      ON ${qualifiedTable} (company_id, foreign_currency_id, account_id)
      WHERE state = 'open';

    CREATE INDEX fx_positions_account_state_idx
      ON ${qualifiedTable} (company_id, account_id, state);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
