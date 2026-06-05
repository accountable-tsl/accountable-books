import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Account elements are the canonical platform-owned accounting taxonomy level
 * between financial statements and account types. They define durable reporting
 * buckets such as assets, liabilities, income, expenses, and their subgroups.
 *
 * Stable rows are loaded by the platform bootstrap `account-elements` phase,
 * not in migrations.
 */

const schemaName = 'app';
const tableName = 'account_elements';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('key', 64).unique().notNullable();
    table.string('label', 256).notNullable();
    table
      .specificType('default_side', `"${schemaName}"."debit_credit"`)
      .notNullable();
    table.string('description', 512).nullable();
    table.string('report_code', 64).nullable();

    table
      .uuid('parent_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.${tableName}`)
      .onDelete('RESTRICT');
    table
      .uuid('financial_statement_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.financial_statements`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['parent_id'], 'account_elements_parent_id_idx');
    table.index(
      ['financial_statement_id'],
      'account_elements_financial_statement_id_idx',
    );
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_elements_key_normalized_chk
    CHECK (key = lower(btrim(key)) AND key ~ '^[a-z][a-z0-9_]*$')
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_elements_label_trimmed_chk
    CHECK (label = btrim(label) AND char_length(label) >= 2)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_elements_description_trimmed_chk
    CHECK (
      description IS NULL
      OR (description = btrim(description) AND char_length(description) >= 2)
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT account_elements_report_code_format_chk
    CHECK (
      report_code IS NULL
      OR (
        report_code = upper(btrim(report_code))
        AND report_code ~ '^(BS|IS)(\\.[A-Z]{3}){1,2}$'
      )
    )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
