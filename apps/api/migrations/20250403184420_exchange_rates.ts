import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Exchange rate prices are platform-owned daily FX reference data.
 *
 * price convention: `rate` is the amount of price currency per 1 unit of base
 * currency (e.g. base USD, price NGN, rate 1500 => 1 USD = 1,500 NGN).
 *
 * Rows are ingested via seed packs, provider APIs, or manual publication.
 * Posted bank/ledger amounts keep their own rate snapshots at write time.
 */

const schemaName = 'app';
const tableName = 'exchange_rates';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.date('rate_date').notNullable();
    table
      .uuid('base_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');
    table
      .uuid('price_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');
    table.decimal('rate', 32, 10).notNullable();
    table
      .string('source', 16)
      .notNullable()
      .checkIn(['seed', 'api', 'manual'], 'exchange_rates_source_chk');
    table.string('provider').nullable();
    table.timestamp('provider_as_of', { useTz: true }).nullable();
    table
      .timestamp('ingested_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ['base_currency_id', 'price_currency_id'],
      'exchange_rates_currency_pair_idx',
    );
    table.index(['rate_date'], 'exchange_rates_rate_date_idx');
    table.unique(['rate_date', 'base_currency_id', 'price_currency_id'], {
      indexName: 'exchange_rates_price_unique',
    });
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT exchange_rates_rate_positive_chk
    CHECK (rate > 0)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT exchange_rates_distinct_currencies_chk
    CHECK (base_currency_id <> price_currency_id)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT exchange_rates_provider_trimmed_chk
    CHECK (provider IS NULL OR (provider = btrim(provider) AND char_length(provider) >= 1))
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
