import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Account types are the canonical platform-owned posting and classification
 * taxonomy beneath account elements. They drive chart-of-accounts templates,
 * bank-feed classification, accrual targeting, and reporting rollups.
 *
 * Stable rows are loaded by the platform bootstrap `account-types` phase,
 * not in migrations.
 */

const schemaName = 'app';
const tableName = 'account_types';
const ACCOUNT_TYPE_LABEL_ROLES = [
  'semantic',
  'mechanical',
  'control',
  'fallback',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('label', 256).notNullable();
    table.string('description', 512).nullable();
    table.string('report_code', 64).nullable();

    table
      .uuid('account_element_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.account_elements`)
      .onDelete('RESTRICT');

    table.boolean('default_monetary').notNullable().defaultTo(false);
    table
      .string('label_role', 24)
      .notNullable()
      .checkIn([...ACCOUNT_TYPE_LABEL_ROLES]);
    table.boolean('trainable').notNullable();
    table.boolean('is_contra').notNullable().defaultTo(false);
    table.boolean('is_postable_control').notNullable().defaultTo(false);
    table.specificType('accrual_targets', 'varchar(256)[]').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['account_element_id'], 'account_types_account_element_id_idx');
    table.index(['label_role'], 'account_types_label_role_idx');
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_types_key_normalized_chk
    CHECK (key = lower(btrim(key)) AND key ~ '^[a-z][a-z0-9_]*$')
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_types_label_trimmed_chk
    CHECK (label = btrim(label) AND char_length(label) >= 2)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_types_description_trimmed_chk
    CHECK (
      description IS NULL
      OR (description = btrim(description) AND char_length(description) >= 2)
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_types_report_code_format_chk
    CHECK (
      report_code IS NULL
      OR (
        report_code = upper(btrim(report_code))
        AND report_code ~ '^(BS|IS)(\\.[A-Z]{3}){3,4}$'
      )
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
