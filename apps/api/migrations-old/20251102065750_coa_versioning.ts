import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * COA versions preserve each account's state over time. Snapshot versions track
 * the current revision of a company's complete chart of accounts for caching,
 * categorization, and other consumers that need a stable revision identifier.
 */

const schemaName = 'app';
const coaTable = 'coa';
const coaVersionsTable = 'coa_versions';
const coaSnapshotVersionsTable = 'coa_snapshot_versions';
const COA_SOURCES = ['user', 'template', 'system'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(schemaName)
    .createTable(coaVersionsTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('coa_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.${coaTable}`)
        .onDelete('RESTRICT');

      table.integer('version_seq').notNullable();
      table
        .timestamp('effective_from', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.timestamp('effective_to', { useTz: true }).nullable();
      table.jsonb('changeset').nullable();

      table.string('code', 256).nullable();
      table.string('name', 256).notNullable();
      table.string('description', 512).nullable();
      table.boolean('is_active').notNullable();
      table.boolean('locked').notNullable();
      table
        .string('source', 16)
        .notNullable()
        .checkIn([...COA_SOURCES], 'coa_versions_source_check');

      table
        .uuid('account_type_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.account_types`)
        .onDelete('RESTRICT');

      table
        .uuid('currency_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.currencies`)
        .onDelete('RESTRICT');

      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
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

      table.unique(['coa_id', 'version_seq'], {
        indexName: 'coa_versions_coa_sequence_unique',
      });
      table.index(
        ['company_id', 'effective_from'],
        'coa_versions_company_effective_from_idx',
      );
    });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_sequence_positive_chk
    CHECK (version_seq >= 1)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_effective_range_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_name_normalized_chk
    CHECK (name = btrim(name) AND char_length(name) >= 1)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_code_normalized_chk
    CHECK (code IS NULL OR (code = btrim(code) AND char_length(code) >= 1))
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_deleted_state_chk
    CHECK (
      (is_deleted = false AND deleted_at IS NULL)
      OR
      (is_deleted = true AND deleted_at IS NOT NULL AND is_active = false)
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaVersionsTable}"
    ADD CONSTRAINT coa_versions_changeset_object_chk
    CHECK (changeset IS NULL OR jsonb_typeof(changeset) = 'object')
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX coa_versions_one_current_version_idx
    ON "${schemaName}"."${coaVersionsTable}" (coa_id)
    WHERE effective_to IS NULL
  `);

  await knex.schema.withSchema(schemaName).alterTable(coaTable, (table) => {
    table.integer('version_seq').notNullable().defaultTo(0);
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaTable}"
    ADD CONSTRAINT coa_version_sequence_nonnegative_chk
    CHECK (version_seq >= 0)
  `);

  await knex.schema
    .withSchema(schemaName)
    .createTable(coaSnapshotVersionsTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');

      table.bigInteger('snapshot_version').notNullable();
      table.string('checksum', 64).notNullable();

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

      table.string('notes', 1024).nullable();
      table.jsonb('metadata').nullable();

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

      table.unique(['company_id'], {
        indexName: 'coa_snapshot_versions_company_unique',
      });
    });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaSnapshotVersionsTable}"
    ADD CONSTRAINT coa_snapshot_versions_sequence_positive_chk
    CHECK (snapshot_version >= 1)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaSnapshotVersionsTable}"
    ADD CONSTRAINT coa_snapshot_versions_not_deleted_chk
    CHECK (is_deleted = false AND deleted_at IS NULL)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaSnapshotVersionsTable}"
    ADD CONSTRAINT coa_snapshot_versions_checksum_chk
    CHECK (checksum ~ '^[0-9a-f]{64}$')
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${coaSnapshotVersionsTable}"
    ADD CONSTRAINT coa_snapshot_versions_metadata_object_chk
    CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
  `);

  await createUpdateTimestampTrigger(
    knex,
    coaSnapshotVersionsTable,
    schemaName,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(
    knex,
    coaSnapshotVersionsTable,
    schemaName,
  );

  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(coaSnapshotVersionsTable);
  await knex.schema.withSchema(schemaName).alterTable(coaTable, (table) => {
    table.dropColumn('version_seq');
  });
  await knex.schema.withSchema(schemaName).dropTableIfExists(coaVersionsTable);
}
