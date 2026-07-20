import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Companies are tenant workspaces. They represent businesses, individuals, and
 * accounting firms, and own operational data such as COA, billing, settings,
 * memberships, and firm-client assignment state.
 */

const schemaName = 'app';
const tableName = 'companies';
const WORKSPACE_CLASSES = ['customer', 'demo', 'platform', 'partner'] as const;
const COMPANY_TYPES = ['business', 'accounting_firm', 'individual'] as const;
const REPORTING_FRAMEWORKS = ['ifrs', 'us_gaap'] as const;
const ACCOUNTING_BASES = [
  'modified_cash_basis',
  'modified_accrual_basis',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('legal_name', 256).notNullable();
    table.string('display_name', 256).nullable();
    table.string('short_code', 50).notNullable();
    table.string('address_line1', 512).nullable();
    table.string('address_line2', 512).nullable();
    table.string('city', 128).nullable();
    table.string('state_region', 128).nullable();
    table.string('postal_code', 64).nullable();
    table
      .string('type', 32)
      .notNullable()
      .checkIn([...COMPANY_TYPES]);
    table.string('description', 2000).nullable();
    table.string('website', 256).nullable();
    table.string('industry', 256).nullable();
    table.string('team_size', 256).nullable();
    table.string('revenue', 256).nullable();
    table.integer('year_end_day').notNullable();
    table.integer('year_end_month').notNullable();
    table
      .string('accounting_basis', 32)
      .notNullable()
      .checkIn([...ACCOUNTING_BASES]);
    table
      .string('reporting_framework', 32)
      .nullable()
      .checkIn([...REPORTING_FRAMEWORKS]);
    table.string('registration_number', 128).nullable();
    table.string('tax_id', 128).nullable();
    table.jsonb('onboarding_state').nullable();
    table.timestamp('onboarding_completed_at', { useTz: true }).nullable();
    table
      .string('workspace_class', 32)
      .checkIn([...WORKSPACE_CLASSES], 'companies_workspace_class_check')
      .notNullable()
      .defaultTo('customer');
    table.date('conversion_date').nullable();

    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.countries`)
      .onDelete('RESTRICT');
    table.string('default_timezone', 64).notNullable().defaultTo('Etc/UTC');

    table
      .uuid('reporting_currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
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

    // Denormalized pointer to the current managing firm. The canonical
    // assignment row lives in client_firm_assignments; the FK is added after
    // accounting_firms_meta exists.
    table.uuid('assigned_firm_id').nullable();

    table.timestamp('legal_name_verified_at', { useTz: true }).nullable();
    table
      .timestamp('registration_number_verified_at', { useTz: true })
      .nullable();
    table.timestamp('tax_id_verified_at', { useTz: true }).nullable();
    table.timestamp('address_verified_at', { useTz: true }).nullable();

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

    table.unique(['short_code'], { indexName: 'companies_short_code_unique' });
    table.index(['assigned_firm_id'], 'companies_assigned_firm_id_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX companies_single_platform_workspace_idx
    ON "${schemaName}"."${tableName}" (workspace_class)
    WHERE workspace_class = 'platform'
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT companies_legal_name_trimmed_chk
        CHECK (legal_name = btrim(legal_name) AND char_length(legal_name) >= 2),
      ADD CONSTRAINT companies_short_code_format_chk
        CHECK (
          short_code = btrim(short_code)
          AND char_length(short_code) BETWEEN 3 AND 50
          AND short_code ~ '^[A-Za-z0-9_-]+$'
        ),
      ADD CONSTRAINT companies_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL) OR
          (is_deleted = true AND deleted_at IS NOT NULL)
        )
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION "${schemaName}".is_valid_iana_timezone(tz text)
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1
        FROM pg_timezone_names
        WHERE name = tz
      );
    $$ LANGUAGE sql STABLE;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT companies_tz_chk
    CHECK ("${schemaName}".is_valid_iana_timezone(default_timezone));
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."users"
    ADD CONSTRAINT users_last_active_company_id_fkey
    FOREIGN KEY (last_active_company_id)
    REFERENCES "${schemaName}"."${tableName}" (id)
    ON DELETE SET NULL
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT companies_year_end_date_chk
      CHECK (
        year_end_month BETWEEN 1 AND 12
        AND year_end_day BETWEEN 1 AND 31
        AND (
          (year_end_month IN (1, 3, 5, 7, 8, 10, 12) AND year_end_day <= 31)
          OR (year_end_month IN (4, 6, 9, 11) AND year_end_day <= 30)
          OR (year_end_month = 2 AND year_end_day <= 29)
        )
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      DROP CONSTRAINT IF EXISTS companies_year_end_date_chk;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."users"
    DROP CONSTRAINT IF EXISTS users_last_active_company_id_fkey
  `);
  await knex.raw(
    `DROP INDEX IF EXISTS "${schemaName}".companies_single_platform_workspace_idx`,
  );
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
  await knex.raw(
    `DROP FUNCTION IF EXISTS "${schemaName}".is_valid_iana_timezone(text)`,
  );
}
