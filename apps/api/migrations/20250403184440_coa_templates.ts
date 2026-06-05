import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * COA templates are platform-owned chart-of-accounts blueprints. Each row
 * represents one account line within a named template and points to a canonical
 * account type; company-specific COA rows are created from these templates at
 * provisioning time.
 *
 * Stable rows are loaded by the platform bootstrap `coa-templates` phase,
 * not in migrations.
 */

const schemaName = 'app';
const tableName = 'coa_templates';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('template_name', 256).notNullable();
    table.string('name', 256).notNullable();
    table.string('code', 256).nullable();
    table.string('description', 512).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('locked').notNullable().defaultTo(false);

    table
      .uuid('account_type_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.account_types`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['account_type_id'], 'coa_templates_account_type_id_idx');
    table.index(
      ['is_active', 'template_name'],
      'coa_templates_active_name_idx',
    );
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_templates_template_name_format_chk
    CHECK (
      template_name = lower(btrim(template_name))
      AND template_name ~ '^(ind|biz|acc):[a-z][a-z0-9_]*:(basic|adv|pro):(code|nocode|none):v[1-9][0-9]*$'
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_templates_name_trimmed_chk
    CHECK (name = btrim(name) AND char_length(name) >= 2)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_templates_code_trimmed_chk
    CHECK (
      code IS NULL
      OR (code = btrim(code) AND char_length(code) >= 1)
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_templates_description_trimmed_chk
    CHECK (
      description IS NULL
      OR (description = btrim(description) AND char_length(description) >= 2)
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX coa_templates_template_name_name_code_unique
    ON "${schemaName}"."${tableName}" (
      template_name,
      lower(name),
      COALESCE(code, '')
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX coa_templates_template_name_code_unique
    ON "${schemaName}"."${tableName}" (template_name, code)
    WHERE code IS NOT NULL
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
