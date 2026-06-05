import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'companies';
const WORKSPACE_CLASSES = ['customer', 'demo', 'platform', 'partner'];
const COMPANY_TYPES = ['business', 'accounting_firm', 'individual'];
const REPORTING_FRAMEWORKS = ['ifrs', 'us_gaap'];
const ACCOUNTING_BASES = ['modified_cash_basis', 'modified_accrual_basis'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('legal_name', 256).notNullable();
    table.string('display_name', 256).nullable();
    table.string('short_code', 11).unique().notNullable();
    table.string('address', 512).nullable();
    table.string('type').notNullable().checkIn(COMPANY_TYPES);
    table.string('description', 2000).nullable();
    table.string('website', 256).nullable();
    table.string('industry', 256).nullable();
    table.string('team_size', 256).nullable();
    table.string('revenue', 256).nullable();
    table.integer('year_end_day').notNullable();
    table.integer('year_end_month').notNullable();
    table.string('accounting_basis').notNullable().checkIn(ACCOUNTING_BASES);
    table
      .string('reporting_framework')
      .nullable()
      .checkIn(REPORTING_FRAMEWORKS);
    table.string('registration_number').nullable();
    table.string('tax_id').nullable();
    table.jsonb('onboarding_state').nullable();
    table.timestamp('onboarding_completed_at', { useTz: true }).nullable();
    table
      .string('workspace_class')
      .checkIn(WORKSPACE_CLASSES, 'companies_workspace_class_check')
      .notNullable()
      .defaultTo('customer');
    table.date('conversion_date').nullable();

    table
      .uuid('country_id')
      .notNullable()
      .references('id')
      .inTable('countries')
      .onDelete('RESTRICT');
    table.text('default_timezone').notNullable().defaultTo('Etc/UTC');

    table
      .uuid('reporting_currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('last_updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('legal_name_verified_at', { useTz: true }).nullable();
    table
      .timestamp('registration_number_verified_at', { useTz: true })
      .nullable();
    table.timestamp('tax_id_verified_at', { useTz: true }).nullable();
    table.timestamp('address_verified_at', { useTz: true }).nullable();

    addStandardColumns(knex, table);

    table.index('short_code');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX companies_single_platform_workspace_idx
    ON companies (workspace_class)
    WHERE workspace_class = 'platform'
  `);

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION is_valid_iana_timezone(tz text)
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1
        FROM pg_timezone_names
        WHERE name = tz
      );
    $$ LANGUAGE sql STABLE;
  `);

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_tz_chk
    CHECK (is_valid_iana_timezone(default_timezone));
  `);

  // Update last_active_company_id column in users table
  await knex.schema.alterTable('users', (table) => {
    table
      .foreign('last_active_company_id')
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
  });

  await knex.raw(`
    ALTER TABLE companies
      ADD CONSTRAINT year_end_month_range
      CHECK (year_end_month >= 1 AND year_end_month <= 12);
  `);

  await knex.raw(`
    ALTER TABLE companies
      ADD CONSTRAINT year_end_day_range
      CHECK (year_end_day >= 1 AND year_end_day <= 31);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE companies
      DROP CONSTRAINT IF EXISTS year_end_day_range;
  `);

  await knex.raw(`
    ALTER TABLE companies
      DROP CONSTRAINT IF EXISTS year_end_month_range;
  `);

  await knex.schema.alterTable('users', (table) => {
    table.dropForeign(['last_active_company_id']);
  });
  await knex.raw(
    `DROP INDEX IF EXISTS companies_single_platform_workspace_idx`,
  );
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
