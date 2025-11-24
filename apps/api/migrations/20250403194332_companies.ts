import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { ENV, isProd } from '../config/env-loader.js';
import { adminUser } from './20250403184441_users.js';

const completeOnbState = {
  steps: {
    company_details_confirmed: true,
    first_bank_account_added: true,
  },
  completed_at: {
    company_details_confirmed: new Date(),
    first_bank_account_added: new Date(),
  },
  metadata: null,
};

export const buildPlatformCompany = (adminUserId: string) => ({
  id: ENV.PLATFORM_COMPANY_ID || 'a494b675-fedd-455c-ab6d-00ffdff9a047',
  legal_name: ENV.PLATFORM_COMPANY_NAME || 'Accountable Techserve Ltd',
  display_name: 'Accountable HQ',
  type: 'accounting_firm',
  country_id: '84258bff-b7ab-4d9f-83f5-1bd1f4e39ace',
  default_timezone: 'Africa/Lagos',
  reporting_currency_id: '1d6a1e31-7e36-4eab-94e1-42f2173ea972',
  created_by_id: adminUserId,
  short_code: ENV.PLATFORM_COMPANY_SHORT_CODE || 'platform',
  website: 'getaccountable.com',
  logo_url:
    ENV.PLATFORM_COMPANY_LOGO_URL || `${ENV.BACKEND_URL}/accountable-logo.png`,
  year_end_day: 31,
  year_end_month: 12,
  reporting_framework: 'ifrs',
  is_platform: true,
  accounting_basis: 'modified_accrual_basis',
  onboarding_state: completeOnbState,
});

export const createPlatformCompany = async (knex: Knex) => {
  if (isProd && !process.env.CONFIRM_PLATFORM_SETUP) {
    throw new Error(
      'Must set CONFIRM_PLATFORM_SETUP=yes to create platform company',
    );
  }

  if (!adminUser.id) throw new Error('adminUserId is required');
  const platformCompany = buildPlatformCompany(adminUser.id);

  return await knex.transaction(async (trx) => {
    // Check if company exists
    const existingPlatformCompany = await trx('companies')
      .where({ id: platformCompany.id })
      .first();

    if (existingPlatformCompany) {
      console.log('Platform company already exists. Skipping insert.');
      return existingPlatformCompany;
    }

    if (!platformCompany.legal_name)
      throw new Error('PLATFORM_COMPANY_NAME must be set');

    if (platformCompany.type !== 'accounting_firm')
      throw new Error('PLATFORM_COMPANY_TYPE must be set to accounting_firm');

    const [inserted] = await knex(tableName)
      .insert(platformCompany)
      .returning('*');
    console.log(`Created platform company: ${platformCompany.legal_name}`);
    return inserted;
  });
};

const tableName = 'companies';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('legal_name', 256).notNullable();
    table.string('display_name', 256).nullable();
    table.string('short_code', 11).unique().notNullable();
    table.string('address', 512).nullable();
    table.specificType('type', 'company_type').notNullable();
    table.string('logo_url').nullable();
    table.string('logo_key').nullable();
    table.string('description', 2000).nullable();
    table.string('website', 256).nullable();
    table.string('industry', 256).nullable();
    table.string('team_size', 256).nullable();
    table.string('revenue', 256).nullable();
    table.integer('year_end_day').notNullable();
    table.integer('year_end_month').notNullable();
    table.specificType('accounting_basis', 'accounting_basis').notNullable();
    table.specificType('reporting_framework', 'reporting_framework').nullable();
    table.string('registration_number').nullable();
    table.string('tax_id').nullable();
    table.jsonb('onboarding_state').nullable();
    table.timestamp('onboarding_completed_at', { useTz: true }).nullable();
    table.boolean('is_demo_company').defaultTo(false);
    table.boolean('is_platform').defaultTo(false);
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

    addStandardColumns(knex, table);

    table.index('short_code');
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await knex.raw(
    `ALTER TABLE companies ADD CONSTRAINT companies_tz_chk CHECK (default_timezone ~ '^[A-Za-z]+/[A-Za-z_]+$')`,
  );
  // await createPlatformCompany(knex);

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
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
