import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

const tableName = 'projects';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('name').notNullable();
    table.string('code').nullable();
    table.string('description', 512).nullable();
    table
      .specificType('status', 'project_status')
      .defaultTo('in_draft')
      .notNullable();

    table.timestamp('start_date', { useTz: true }).nullable();
    table.timestamp('end_date', { useTz: true }).nullable();

    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');

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

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    addStandardColumns(knex, table);

    table.unique(['company_id', 'name']);
    table.index(['company_id', 'status'], 'project_company_status_idx');
    table.index(['company_id', 'created_at']);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
  CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_code_company_idx
  ON ${tableName}(company_id, code)
  WHERE code IS NOT NULL
`);

  await createTrgmIndexes(knex, tableName, ['name', 'code', 'description']);
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
