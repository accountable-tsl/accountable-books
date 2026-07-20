import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_plan_catalog_prices';

/**
 * Direct catalog prices only.
 *
 * This table stores fixed catalog subscription prices for:
 * - firm plans
 * - business self-serve plans
 * - individual plans
 *
 * It must not be used for:
 * - managed-workspace wholesale pricing
 * - firm sell-price policies
 * - negotiated pricing agreements
 */
const BILLING_INTERVALS = ['month', 'year'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('plan_catalog_id')
      .notNullable()
      .references('id')
      .inTable('billing_plan_catalog')
      .onDelete('CASCADE');

    table.string('currency_code', 3).notNullable();

    table
      .string('billing_interval', 16)
      .notNullable()
      .checkIn(BILLING_INTERVALS, 'billing_plan_catalog_prices_interval_check');

    table.bigInteger('unit_amount_minor').notNullable();

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
    ADD CONSTRAINT billing_plan_catalog_prices_amount_nonnegative_check
    CHECK (unit_amount_minor >= 0);
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_catalog_prices_time_window_check
    CHECK (expires_at IS NULL OR expires_at > effective_at);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_catalog_prices_plan_catalog_id_idx
    ON ${tableName} (plan_catalog_id);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_catalog_prices_lookup_idx
    ON ${tableName} (plan_catalog_id, currency_code, billing_interval);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_catalog_prices_active_version_idx
    ON ${tableName} (plan_catalog_id, currency_code, billing_interval, effective_at);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_catalog_prices_single_open_ended_idx
    ON ${tableName} (plan_catalog_id, currency_code, billing_interval)
    WHERE expires_at IS NULL;
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_catalog_prices_no_overlapping_windows
    EXCLUDE USING gist (
      plan_catalog_id WITH =,
      currency_code WITH =,
      billing_interval WITH =,
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
