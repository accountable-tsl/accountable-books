import type { Knex } from 'knex';

import { createPlatformCompany } from './20250403194332_companies.js';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

export const buildPlatformAccountingFirm = (platformCompany: {
  id: string;
}) => ({
  company_id: platformCompany.id,
  slug: 'app',
});
export const createPlatformFirm = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);

  const platformFirm = buildPlatformAccountingFirm(platformCompany);

  const platformFirmExists = await knex(tableName)
    .where({ company_id: platformFirm.company_id })
    .first();

  if (platformFirmExists) {
    console.log('Platform accounting firm already exists. Skipping insert.');
    const { company_id: platformCompanyId, ...rest } = platformFirmExists;
    return {
      id: platformCompanyId,
      ...rest,
    };
  }

  const [{ company_id: id, ...rest }] = await knex(tableName)
    .insert(platformFirm)
    .returning('*');

  console.log(
    `Successfully created platform accounting firm: ${platformCompany.display_name || platformCompany.legal_name}`,
  );
  return { id, ...rest };
};

const tableName = 'accounting_firms_meta';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .primary()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE'); // Company that is the accounting firm's HQ

    table.string('slug', 20).unique().nullable();
    table.string('firm_type', 50).nullable(); //freelancer, ca / cpa, tax preparer, international

    addStandardColumns(knex, table);
  });

  const hasColumn = await knex.schema.hasColumn(
    'companies',
    'assigned_firm_id',
  );
  if (!hasColumn) {
    await knex.schema.alterTable('companies', (table) => {
      table
        .uuid('assigned_firm_id')
        .references('company_id')
        .inTable('accounting_firms_meta')
        .onDelete('SET NULL');
    });
  }

  await createUpdateTimestampTrigger(knex, tableName);
  // await createPlatformFirm(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);

  // Remove the foreign key constraint from companies table first
  const hasColumn = await knex.schema.hasColumn(
    'companies',
    'assigned_firm_id',
  );
  if (hasColumn) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropForeign(['assigned_firm_id']);
      table.dropColumn('assigned_firm_id');
    });
  }

  await knex.schema.dropTableIfExists(tableName);
}
