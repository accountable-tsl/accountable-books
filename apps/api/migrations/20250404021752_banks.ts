import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

/**
 * Banks are the application's canonical internal financial-institution
 * identities. Bank accounts and provider-specific institution mappings point
 * to these rows so that one institution has a stable identity across banking
 * integrations.
 *
 * Stable rows are loaded by the platform bootstrap `banks` phase, not in
 * migrations. Provider-discovered institutions may also be added at runtime.
 */

const schemaName = 'app';
const tableName = 'banks';
const BANK_LOCAL_CODE_TYPES = [
  'sort_code',
  'routing',
  'bank_code',
  'nip_code',
  'ifsc',
  'blz',
  'zengin_code',
  'cnaps',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 128).notNullable();
    table.string('display_name', 256).notNullable();
    table.string('official_name', 256).nullable();

    table
      .string('swift_code', 11)
      .nullable()
      .comment('Primary ISO 9362 BIC/SWIFT identifier, when known');
    table
      .string('local_code', 64)
      .nullable()
      .comment('Primary country-local institution identifier');
    table
      .string('local_code_type', 32)
      .nullable()
      .comment('Identifier scheme used by local_code')
      .checkIn([...BANK_LOCAL_CODE_TYPES], 'banks_local_code_type_chk');
    table
      .string('alternate_identifier', 128)
      .nullable()
      .comment(
        'Additional institution identifier whose scheme is not modeled in this flat record',
      );

    table.text('website').nullable();
    table.text('logo_url').nullable();

    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.countries`)
      .onDelete('RESTRICT');

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
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.unique(['key'], {
      indexName: 'banks_key_unique',
    });
    table.index(
      ['country_id', 'display_name'],
      'banks_country_id_display_name_idx',
    );
    table.index(
      ['country_id', 'swift_code'],
      'banks_country_id_swift_code_idx',
    );
    table.index(
      ['country_id', 'local_code'],
      'banks_country_id_local_code_idx',
    );
    table.index(
      ['country_id', 'alternate_identifier'],
      'banks_country_id_alternate_identifier_idx',
    );
    table.index(
      ['country_id', 'official_name'],
      'banks_country_id_official_name_idx',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Canonical internal financial-institution identities shared by bank accounts and provider-specific institution mappings.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT banks_key_format_chk
        CHECK (
          key = lower(btrim(key))
          AND key ~ '^[a-z]{2}_[a-z0-9_]+$'
        ),
      ADD CONSTRAINT banks_display_name_trimmed_chk
        CHECK (display_name = btrim(display_name) AND char_length(display_name) >= 1),
      ADD CONSTRAINT banks_official_name_trimmed_chk
        CHECK (
          official_name IS NULL
          OR (official_name = btrim(official_name) AND char_length(official_name) >= 1)
        ),
      ADD CONSTRAINT banks_swift_code_normalized_chk
        CHECK (
          swift_code IS NULL
          OR (
            swift_code = upper(btrim(swift_code))
            AND swift_code ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
          )
        ),
      ADD CONSTRAINT banks_local_code_trimmed_chk
        CHECK (
          local_code IS NULL
          OR (local_code = btrim(local_code) AND char_length(local_code) >= 1)
        ),
      ADD CONSTRAINT banks_local_code_type_consistency_chk
        CHECK (
          (local_code IS NULL AND local_code_type IS NULL)
          OR
          (local_code IS NOT NULL AND local_code_type IS NOT NULL)
        ),
      ADD CONSTRAINT banks_alternate_identifier_trimmed_chk
        CHECK (
          alternate_identifier IS NULL
          OR (
            alternate_identifier = btrim(alternate_identifier)
            AND char_length(alternate_identifier) >= 1
          )
        ),
      ADD CONSTRAINT banks_website_trimmed_chk
        CHECK (
          website IS NULL
          OR (website = btrim(website) AND char_length(website) >= 1)
        ),
      ADD CONSTRAINT banks_logo_url_trimmed_chk
        CHECK (
          logo_url IS NULL
          OR (logo_url = btrim(logo_url) AND char_length(logo_url) >= 1)
        ),
      ADD CONSTRAINT banks_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR
          (is_deleted = true AND deleted_at IS NOT NULL)
        );
  `);

  await createTrgmIndexes(
    knex,
    tableName,
    ['display_name', 'official_name'],
    'search_text',
    schemaName,
  );
  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName, 'search_text', schemaName);
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
