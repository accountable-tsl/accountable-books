import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'bank_accounts';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('display_name').notNullable();
    table.string('account_name').nullable();
    table.specificType('account_type', 'bank_account_type').nullable();
    table.string('account_number').notNullable();
    table.specificType('business_or_personal', 'business_or_personal_account').nullable();

    table.uuid('bank_id').notNullable().references('id').inTable('banks').onDelete('RESTRICT');

    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table.uuid('coa_id').notNullable().references('id').inTable('coa').onDelete('RESTRICT');

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.index(['company_id', 'bank_id'], 'bank_account_company_bank_index');
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
