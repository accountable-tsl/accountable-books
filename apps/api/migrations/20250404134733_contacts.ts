import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

const schemaName = 'app';
const tableName = 'contacts';

const CONTACT_STATUSES = ['active', 'archived'] as const;

const CONTACT_CREATED_VIA = [
  'manual', // user created it.
  'system_inferred', // inferred from bank/counterparty data and needs review.
  'import', // user/import file created it.
  'integration', // created via integration/sync (e.g. from connected bank data, or from connected CRM)
  'demo', // demo/bootstrap data.
  'system', // internal platform/system-owned contact if ever needed.
] as const;

const CONTACT_REVIEW_STATUSES = [
  'unreviewed',
  'confirmed',
  'rejected',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('display_name', 256).notNullable();
    table.string('normalized_name', 256).notNullable();
    table.string('email', 256).nullable();
    table.string('address', 512).nullable();
    table
      .string('status', 16)
      .notNullable()
      .checkIn([...CONTACT_STATUSES], 'contacts_status_chk')
      .defaultTo('active');
    table.string('notes', 1024).nullable();
    table
      .string('created_via', 48)
      .notNullable()
      .checkIn([...CONTACT_CREATED_VIA], 'contacts_created_via_chk')
      .defaultTo('manual');
    table
      .string('review_status', 32)
      .notNullable()
      .checkIn([...CONTACT_REVIEW_STATUSES], 'contacts_review_status_chk')
      .defaultTo('confirmed');

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
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table
      .uuid('reviewed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();

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

    table.unique(['id', 'company_id']);
    table.index(['company_id', 'display_name']);
    table.index(['company_id', 'normalized_name']);
    table.index(['company_id', 'status']);
    table.index(['company_id', 'created_via']);
    table.index(['company_id', 'review_status']);
    table.index(['company_id', 'created_at']);
    table.index(['company_id', 'is_deleted', 'status']);
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT contacts_display_name_trimmed_chk
        CHECK (display_name = btrim(display_name) AND char_length(display_name) >= 1),
      ADD CONSTRAINT contacts_normalized_name_trimmed_chk
        CHECK (normalized_name = btrim(normalized_name) AND char_length(normalized_name) >= 1),
      ADD CONSTRAINT contacts_optional_text_chk
        CHECK (
          (
            email IS NULL
            OR (
              email = lower(btrim(email))
              AND char_length(email) >= 3
            )
          )
          AND (
            address IS NULL
            OR (
              address = btrim(address)
              AND char_length(address) >= 1
            )
          )
          AND (
            notes IS NULL
            OR (
              notes = btrim(notes)
              AND char_length(notes) >= 1
            )
          )
        ),
      ADD CONSTRAINT contacts_review_state_chk
        CHECK (
          (
            review_status = 'unreviewed'
            AND reviewed_at IS NULL
            AND reviewed_by_id IS NULL
          )
          OR
          (
            review_status = 'confirmed'
            AND reviewed_at IS NOT NULL
          )
          OR
          (
            review_status = 'rejected'
            AND reviewed_at IS NOT NULL
            AND status = 'archived'
          )
        ),
      ADD CONSTRAINT contacts_soft_delete_chk
        CHECK (
          (
            is_deleted = false
            AND deleted_at IS NULL
            AND deleted_by_id IS NULL
          )
          OR
          (
            is_deleted = true
            AND deleted_at IS NOT NULL
            AND deleted_by_id IS NOT NULL
            AND status = 'archived'
          )
        );
  `);

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Canonical company contacts. Names are descriptive attributes, not identity keys.';
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
  await createTrgmIndexes(
    knex,
    tableName,
    ['display_name', 'email', 'address', 'notes'],
    'search_text',
    schemaName,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName, 'search_text', schemaName);
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
