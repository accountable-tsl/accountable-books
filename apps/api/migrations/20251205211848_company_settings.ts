import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'company_settings';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.text('key').notNullable();

    table.boolean('bool_value').nullable();
    table.bigint('int_value').nullable();
    table.text('string_value').nullable();
    table.jsonb('json_value').nullable();

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

    addStandardColumns(knex, table); // create_at, updated_at, is_deleted, deleted_at

    table.primary(['company_id', 'key']);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  // Check constraint that enforces exactly one value column is set
  await knex.schema.raw(`
    ALTER TABLE ${tableName}
      ADD CONSTRAINT company_settings_value_check
      CHECK (
        (bool_value IS NOT NULL)::int +
        (int_value IS NOT NULL)::int +
        (string_value IS NOT NULL)::int +
        (json_value IS NOT NULL)::int = 1
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTable(tableName);
}
