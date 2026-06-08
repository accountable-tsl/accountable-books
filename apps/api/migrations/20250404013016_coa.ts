import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Chart-of-accounts rows are company-owned ledger accounts used for posting,
 * reporting, banking integration, and categorization.
 *
 * Every account is classified by a canonical account type and denominated in
 * its company's reporting currency. Source-currency amounts remain on the
 * originating transaction and ledger-entry records.
 */

const schemaName = 'app';
const tableName = 'coa';
const COA_SOURCES = ['user', 'template', 'system'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 256).nullable();
    table.string('name', 256).notNullable();
    table.string('description', 512).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('locked').notNullable().defaultTo(false);
    table
      .string('source', 16)
      .notNullable()
      .defaultTo('user')
      .checkIn([...COA_SOURCES], 'coa_source_check');

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

    table.index(
      ['company_id', 'is_deleted', 'is_active'],
      'coa_company_lifecycle_idx',
    );
    table.index(
      ['company_id', 'account_type_id'],
      'coa_company_account_type_idx',
    );
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_name_normalized_chk
    CHECK (name = btrim(name) AND char_length(name) >= 1)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_code_normalized_chk
    CHECK (code IS NULL OR (code = btrim(code) AND char_length(code) >= 1))
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT coa_deleted_state_chk
    CHECK (
      (is_deleted = false AND deleted_at IS NULL)
      OR
      (is_deleted = true AND deleted_at IS NOT NULL AND is_active = false)
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX coa_company_code_unique_idx
    ON "${schemaName}"."${tableName}" (company_id, lower(code))
    WHERE code IS NOT NULL AND is_deleted = false
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX coa_company_name_unique_idx
    ON "${schemaName}"."${tableName}" (company_id, lower(name))
    WHERE is_deleted = false
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".enforce_coa_reporting_currency()
    RETURNS TRIGGER AS $$
    DECLARE
      company_reporting_currency_id UUID;
    BEGIN
      SELECT reporting_currency_id
      INTO company_reporting_currency_id
      FROM "${schemaName}"."companies"
      WHERE id = NEW.company_id;

      IF company_reporting_currency_id IS NULL THEN
        RAISE EXCEPTION 'Company % does not have a reporting currency', NEW.company_id;
      END IF;

      IF NEW.currency_id IS DISTINCT FROM company_reporting_currency_id THEN
        RAISE EXCEPTION 'COA currency must match company reporting currency';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER enforce_coa_reporting_currency
    BEFORE INSERT OR UPDATE OF company_id, currency_id
    ON "${schemaName}"."${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".enforce_coa_reporting_currency()
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".prevent_company_reporting_currency_drift()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.reporting_currency_id IS DISTINCT FROM OLD.reporting_currency_id
        AND EXISTS (
          SELECT 1
          FROM "${schemaName}"."${tableName}"
          WHERE company_id = NEW.id
            AND currency_id IS DISTINCT FROM NEW.reporting_currency_id
        )
      THEN
        RAISE EXCEPTION 'Company reporting currency cannot change while COA rows use the existing reporting currency';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER prevent_company_reporting_currency_drift
    BEFORE UPDATE OF reporting_currency_id
    ON "${schemaName}"."companies"
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".prevent_company_reporting_currency_drift()
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.raw(`
    DROP TRIGGER IF EXISTS prevent_company_reporting_currency_drift
    ON "${schemaName}"."companies"
  `);
  await knex.raw(`
    DROP FUNCTION IF EXISTS "${schemaName}".prevent_company_reporting_currency_drift()
  `);
  await knex.raw(`
    DROP TRIGGER IF EXISTS enforce_coa_reporting_currency
    ON "${schemaName}"."${tableName}"
  `);
  await knex.raw(`
    DROP FUNCTION IF EXISTS "${schemaName}".enforce_coa_reporting_currency()
  `);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
