import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/timestamp';

const tableName = 'firm_user_client_assignments';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('firm_staff_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.uuid('updated_by_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    table.uuid('created_by_id').nullable().references('id').inTable('users').onDelete('RESTRICT');

    addStandardColumns(table);

    table.unique(['firm_staff_user_id', 'client_company_id']);
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
