import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const tableName = 'bank_feed_providers';
const PROVIDER_STATUSES = ['active', 'inactive', 'deprecated'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .string('key', 64)
      .unique({ indexName: 'bank_feed_providers_key_unique' })
      .notNullable();
    table.string('display_name', 128).notNullable();
    table.string('description', 512).nullable();
    table.string('website', 2048).nullable();
    table.string('logo_url', 2048).nullable();
    table
      .string('status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn([...PROVIDER_STATUSES], 'bank_feed_providers_status_check');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

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
    ADD CONSTRAINT bank_feed_providers_key_normalized_chk
    CHECK (
      key = lower(btrim(key))
      AND char_length(key) >= 1
      AND key ~ '^[a-z][a-z0-9_]*$'
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT bank_feed_providers_display_name_normalized_chk
    CHECK (display_name = btrim(display_name) AND char_length(display_name) >= 1)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT bank_feed_providers_optional_text_normalized_chk
    CHECK (
      (description IS NULL OR (description = btrim(description) AND char_length(description) >= 1))
      AND (website IS NULL OR (website = btrim(website) AND char_length(website) >= 1))
      AND (logo_url IS NULL OR (logo_url = btrim(logo_url) AND char_length(logo_url) >= 1))
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
