import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Financial statements are the platform-owned reporting buckets used to
 * classify account elements and drive statement layout (profit & loss,
 * balance sheet, cash flow).
 *
 * Rows (is, bs, cf) with stable UUIDs and framework labels are loaded via
 * the platform bootstrap `financial-statements` phase, not in migrations.
 */

const schemaName = 'app';
const tableName = 'financial_statements';
const FS_KEYS = ['is', 'bs', 'cf'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .string('key', 8)
      .unique()
      .notNullable()
      .checkIn([...FS_KEYS]);

    table.string('us_gaap_label', 256).notNullable();
    table.string('ifrs_label', 256).notNullable();
    table.string('default_label', 256).notNullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT financial_statements_key_normalized_chk
    CHECK (key = lower(btrim(key)) AND key ~ '^[a-z][a-z0-9_]*$')
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
