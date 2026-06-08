import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Accounting firm metadata extends company workspaces that operate as firms.
 * The company row remains the workspace identity; this table stores firm-only
 * public routing metadata such as slug and firm classification.
 */

const schemaName = 'app';
const tableName = 'accounting_firms_meta';
const FIRM_TYPES = [
  'freelancer',
  'ca_cpa',
  'tax_preparer',
  'international',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .primary()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table.string('slug', 20).unique().notNullable();
    table
      .string('firm_type', 50)
      .nullable()
      .checkIn([...FIRM_TYPES]);

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
    ADD CONSTRAINT accounting_firms_meta_slug_format_chk
    CHECK (
      slug = lower(btrim(slug))
      AND char_length(slug) BETWEEN 3 AND 20
      AND slug ~ '^[a-z]+(-[a-z]+)*$'
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."companies"
    ADD CONSTRAINT companies_assigned_firm_id_fkey
    FOREIGN KEY (assigned_firm_id)
    REFERENCES "${schemaName}"."${tableName}" (company_id)
    ON DELETE SET NULL
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."companies"
    DROP CONSTRAINT IF EXISTS companies_assigned_firm_id_fkey
  `);

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
