import type { Knex } from 'knex';

import {
  addStandardColumns,
  addUserAuditColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

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

    addUserAuditColumns(table);
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
