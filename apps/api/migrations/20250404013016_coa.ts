import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';
import { createPlatformCompany } from './20250403194332_companies';

const tableName = 'coa';

const addCoaToPlatformCompany = async (knex: Knex) => {
  const platformCompany = await createPlatformCompany(knex);

  const existingCoa = await knex('coa').where({ company_id: platformCompany.id }).first();

  if (existingCoa) {
    console.log('Platform COA already exists. Skipping.');
    return;
  }

  const template_name = 'acc:prof:basic:code:v1';
  const coaTemplate = await knex('coa_templates')
    .where('is_active', true)
    .where('template_name', template_name)
    .select(['code', 'name', 'description', 'account_type_id', 'locked']);

  if (!coaTemplate.length) {
    throw new Error('COA template not found');
  }

  const toInsert = coaTemplate.map((t) => {
    return {
      code: t.code,
      name: t.name,
      account_type_id: t.account_type_id,
      description: t.description,
      is_active: true,
      currency_id: platformCompany.reporting_currency_id,
      company_id: platformCompany.id,
      created_by_id: platformCompany.created_by_id,
      locked: t.locked,
      source: 'template',
    };
  });
  const res = await knex('coa').insert(toInsert).returning('id');
  console.log('Platform COA template loaded:', res.length);
};
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('code', 256).nullable();
    table.string('name', 256).notNullable();
    table.string('description', 512).nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('locked').defaultTo(false);
    table.specificType('source', 'coa_source').nullable();

    table
      .uuid('account_type_id')
      .notNullable()
      .references('id')
      .inTable('account_types')
      .onDelete('RESTRICT');

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

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.uuid('updated_by_id').references('id').inTable('users').onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.index(['company_id', 'is_deleted'], 'coa_company_deleted_idx');
    table.index(['company_id', 'is_active'], 'coa_company_active_idx');
    table.index(['account_type_id'], 'coa_account_type_idx');

    table.unique(['name', 'code', 'company_id'], {
      indexName: 'coa_name_code_company_unique',
    });

    table.unique(['name', 'account_type_id', 'company_id']);
    table.unique(['code', 'company_id']);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await addCoaToPlatformCompany(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
