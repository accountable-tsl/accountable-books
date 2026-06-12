import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

/**
 * Projects are company-scoped accounting/reporting dimensions used to tag
 * journal, ledger, import, and categorization activity to a body of work.
 * A project may optionally be tied to a contact when the work is client,
 * vendor, or counterparty specific, but internal projects are valid too.
 */

const schemaName = 'app';
const tableName = 'projects';
const PROJECT_STATUSES = [
  'in_draft',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('name', 256).notNullable();
    table.string('code', 64).nullable();
    table.string('description', 512).nullable();
    table
      .string('status', 32)
      .notNullable()
      .checkIn(PROJECT_STATUSES, 'projects_status_chk')
      .defaultTo('in_draft');

    table.date('start_date').nullable();
    table.date('end_date').nullable();

    table.uuid('contact_id').nullable();

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

    table
      .foreign(['contact_id', 'company_id'], 'projects_contact_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    table.index(['company_id', 'status'], 'project_company_status_idx');
    table.index(['company_id', 'created_at']);

    table.unique(['id', 'company_id']);
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT projects_name_trimmed_chk
        CHECK (name = btrim(name) AND char_length(name) >= 2),
      ADD CONSTRAINT projects_optional_text_chk
        CHECK (
          (
            code IS NULL
            OR (
              code = btrim(code)
              AND char_length(code) BETWEEN 1 AND 64
            )
          )
          AND (
            description IS NULL
            OR (
              description = btrim(description)
              AND char_length(description) >= 1
            )
          )
        ),
      ADD CONSTRAINT projects_date_order_chk
        CHECK (
          start_date IS NULL
          OR end_date IS NULL
          OR start_date <= end_date
        );
  `);

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Company-scoped accounting/reporting dimensions used to tag journal, ledger, import, and categorization activity to a body of work.';
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.raw(`
    CREATE UNIQUE INDEX projects_company_code_unique
    ON "${schemaName}"."${tableName}" (company_id, lower(code))
    WHERE code IS NOT NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX projects_company_internal_name_unique
    ON "${schemaName}"."${tableName}" (company_id, lower(name))
    WHERE contact_id IS NULL;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX projects_company_contact_name_unique
    ON "${schemaName}"."${tableName}" (company_id, contact_id, lower(name))
    WHERE contact_id IS NOT NULL;
  `);

  await createTrgmIndexes(
    knex,
    tableName,
    ['name', 'code', 'description'],
    'search_text',
    schemaName,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName, 'search_text', schemaName);
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
