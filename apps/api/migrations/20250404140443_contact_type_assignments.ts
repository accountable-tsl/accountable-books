import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const tableName = 'contact_type_assignments';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('contact_id').notNullable();
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.specificType('type', 'contact_type').notNullable();

    table
      .uuid('created_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign(['contact_id', 'company_id'])
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    table.primary(['contact_id', 'type']);
    table.index(['company_id', 'type']);
  });

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
