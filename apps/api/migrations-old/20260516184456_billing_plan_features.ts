import type { Knex } from 'knex';
import { billing } from '@accountable-books/contracts/schema';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_plan_features';
const BILLING_PLAN_FEATURE_CODES = [...billing.BILLING_PLAN_FEATURE_CODES];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('plan_catalog_id')
      .notNullable()
      .references('id')
      .inTable('billing_plan_catalog')
      .onDelete('CASCADE');

    table
      .string('feature_code', 120)
      .notNullable()
      .checkIn(
        BILLING_PLAN_FEATURE_CODES,
        'billing_plan_features_feature_code_check',
      );

    table
      .jsonb('feature_value_json')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

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
    ADD CONSTRAINT billing_plan_features_value_object_check
    CHECK (jsonb_typeof(feature_value_json) = 'object');
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_features_time_window_check
    CHECK (expires_at IS NULL OR expires_at > effective_at);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_features_plan_catalog_id_idx
    ON ${tableName} (plan_catalog_id);
  `);

  await knex.raw(`
    CREATE INDEX billing_plan_features_lookup_idx
    ON ${tableName} (plan_catalog_id, feature_code);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_features_version_idx
    ON ${tableName} (plan_catalog_id, feature_code, effective_at);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_plan_features_single_open_ended_idx
    ON ${tableName} (plan_catalog_id, feature_code)
    WHERE expires_at IS NULL;
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_plan_features_no_overlapping_windows
    EXCLUDE USING gist (
      plan_catalog_id WITH =,
      feature_code WITH =,
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
