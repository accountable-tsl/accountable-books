import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

const tableName = 'contacts';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('display_name', 256).notNullable();
    table.string('normalized_name', 256).notNullable();
    table.string('email', 256).nullable();
    table.string('address', 512).nullable();
    table
      .specificType('status', 'contact_status')
      .nullable()
      .defaultTo('active');
    table.string('notes').nullable();

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

    table.unique(['company_id', 'normalized_name']);
    table.index(['company_id', 'display_name']);
    table.index(['company_id', 'status']);
    table.index(['company_id', 'created_at']);
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await createTrgmIndexes(knex, tableName, [
    'display_name',
    'email',
    'address',
    'notes',
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, tableName);
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
