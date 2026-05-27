import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_plan_catalog_provider_prices';

const PROVIDER_PRICE_STATUSES = ['active', 'inactive', 'deprecated'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('billing_plan_catalog_price_id')
      .notNullable()
      .references('id')
      .inTable('billing_plan_catalog_prices')
      .onDelete('CASCADE');

    table.string('provider_key', 64).notNullable();
    table.string('provider_product_id', 128).nullable();
    table.string('provider_price_id', 128).notNullable();
    table.string('country_code', 2).nullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn(
        PROVIDER_PRICE_STATUSES,
        'billing_plan_catalog_provider_prices_status_check',
      );

    table.timestamp('effective_at', { useTz: true }).notNullable();
    table.timestamp('expires_at', { useTz: true }).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_catalog_provider_prices_time_window_check
    CHECK (expires_at IS NULL OR expires_at > effective_at);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_catalog_provider_prices_billing_price_idx
    ON ${tableName} (billing_plan_catalog_price_id);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_catalog_provider_prices_lookup_idx
    ON ${tableName} (billing_plan_catalog_price_id, provider_key, country_code, status);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_catalog_provider_prices_provider_price_unique_idx
    ON ${tableName} (provider_key, provider_price_id);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_catalog_provider_prices_version_idx
    ON ${tableName} (
      billing_plan_catalog_price_id,
      provider_key,
      COALESCE(country_code, ''),
      effective_at
    );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_catalog_provider_prices_single_open_ended_idx
    ON ${tableName} (
      billing_plan_catalog_price_id,
      provider_key,
      COALESCE(country_code, '')
    )
    WHERE expires_at IS NULL;
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_catalog_provider_prices_no_overlapping_windows
    EXCLUDE USING gist (
      billing_plan_catalog_price_id WITH =,
      provider_key WITH =,
      COALESCE(country_code, '') WITH =,
      tstzrange(
        effective_at,
        COALESCE(expires_at, 'infinity'::timestamptz),
        '[)'
      ) WITH &&
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
