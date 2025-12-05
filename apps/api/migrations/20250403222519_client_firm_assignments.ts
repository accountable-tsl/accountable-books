import type { Knex } from 'knex';

import { createPlatformCompany } from './20250403194332_companies.js';
import { createPlatformFirm } from './20250403194335_accounting_firms_meta.js';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

// This table maps which business is assigned to which accounting firm. Think of it like:
// Business A is being managed by Accounting Firm X.
// Only one firm per business is allowed, but a firm can manage many businesses.
export const insertPlatformFirmCompany = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);
  const platformAccountingFirm = await createPlatformFirm(knex);

  if (!platformCompany?.id || !platformAccountingFirm?.id) {
    throw new Error('Invalid platform company or accounting firm returned');
  }

  const exists = await knex(tableName)
    .where({
      client_company_id: platformCompany.id,
      accounting_firm_company_id: platformAccountingFirm.id,
    })
    .first();

  if (exists) {
    console.log('Platform firm-company link already exists.');
    return;
  }

  await knex(tableName).insert({
    client_company_id: platformCompany.id,
    accounting_firm_company_id: platformAccountingFirm.id,
    updated_by_id: platformCompany.created_by_id,
    created_by_id: platformCompany.created_by_id,
  });

  await knex('companies')
    .where({ id: platformCompany.id })
    .update({ assigned_firm_id: platformAccountingFirm.id });

  console.log('Linked platform company to platform accounting firm.');
};

const tableName = 'client_firm_assignments';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('accounting_firm_company_id')
      .notNullable()
      .references('company_id')
      .inTable('accounting_firms_meta')
      .onDelete('CASCADE');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    addStandardColumns(knex, table);

    table.unique(['client_company_id']);

    table.index(['accounting_firm_company_id']);
    table.index(['client_company_id', 'accounting_firm_company_id']);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  // await insertPlatformFirmCompany(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
