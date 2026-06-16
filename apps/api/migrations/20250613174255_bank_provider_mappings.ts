import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Bank provider mappings link a bank feed provider's institution identity to
 * our canonical `banks` row. Example: Plaid institution "ins_123" maps to our
 * internal Chase record. Rows are created at runtime during provider discovery
 * and bank resolution; they are not bootstrap catalog data.
 */
const schemaName = 'app';
const tableName = 'bank_provider_mappings';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('bank_feed_provider_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_feed_providers`)
      .onDelete('RESTRICT');

    table
      .uuid('bank_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.banks`)
      .onDelete('RESTRICT');

    table
      .string('provider_institution_id', 128)
      .notNullable()
      .comment('Primary institution identifier from the bank feed provider');

    table.string('provider_institution_alternate_id', 64).nullable();
    table
      .string('provider_institution_secondary_reference', 64)
      .nullable()
      .comment('Fallback institution identifier from the provider');
    table.string('provider_institution_name', 256).nullable();
    table.jsonb('raw_provider_data').nullable();

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
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

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

    table.index(['bank_id'], 'bank_provider_mappings_bank_id_idx');
    table.index(
      ['bank_feed_provider_id'],
      'bank_provider_mappings_bank_feed_provider_id_idx',
    );
    table.index(
      ['bank_feed_provider_id', 'bank_id'],
      'bank_provider_mappings_provider_bank_idx',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Runtime mappings from provider-specific institution identities to canonical internal bank records.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_provider_mappings_provider_institution_id_trimmed_chk
        CHECK (
          provider_institution_id = btrim(provider_institution_id)
          AND char_length(provider_institution_id) >= 1
        ),
      ADD CONSTRAINT bank_provider_mappings_optional_text_trimmed_chk
        CHECK (
          (
            provider_institution_alternate_id IS NULL
            OR (
              provider_institution_alternate_id = btrim(provider_institution_alternate_id)
              AND char_length(provider_institution_alternate_id) >= 1
            )
          )
          AND (
            provider_institution_secondary_reference IS NULL
            OR (
              provider_institution_secondary_reference = btrim(provider_institution_secondary_reference)
              AND char_length(provider_institution_secondary_reference) >= 1
            )
          )
          AND (
            provider_institution_name IS NULL
            OR (
              provider_institution_name = btrim(provider_institution_name)
              AND char_length(provider_institution_name) >= 1
            )
          )
        ),
      ADD CONSTRAINT bank_provider_mappings_soft_delete_chk
        CHECK (
          (
            is_deleted = false
            AND deleted_at IS NULL
            AND deleted_by_id IS NULL
          )
          OR (
            is_deleted = true
            AND deleted_at IS NOT NULL
            AND deleted_by_id IS NOT NULL
          )
        );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_provider_mappings_provider_institution_unique
    ON "${schemaName}"."${tableName}" (bank_feed_provider_id, provider_institution_id)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX bank_provider_mappings_provider_alternate_id_idx
    ON "${schemaName}"."${tableName}" (bank_feed_provider_id, provider_institution_alternate_id)
    WHERE provider_institution_alternate_id IS NOT NULL AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX bank_provider_mappings_provider_secondary_reference_idx
    ON "${schemaName}"."${tableName}" (bank_feed_provider_id, provider_institution_secondary_reference)
    WHERE provider_institution_secondary_reference IS NOT NULL AND is_deleted = false;
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.raw(`
    DROP INDEX IF EXISTS "${schemaName}".bank_provider_mappings_provider_bank_idx;
    DROP INDEX IF EXISTS "${schemaName}".bank_provider_mappings_provider_secondary_reference_idx;
    DROP INDEX IF EXISTS "${schemaName}".bank_provider_mappings_provider_alternate_id_idx;
    DROP INDEX IF EXISTS "${schemaName}".bank_provider_mappings_provider_institution_unique;
  `);

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
