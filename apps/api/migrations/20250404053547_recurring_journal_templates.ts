import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db';

const tableName = 'recurring_journal_templates';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('description', 512).notNullable();
    table.string('note', 1000).nullable();
    table.specificType('status', 'recurring_journal_status').notNullable().defaultTo('draft');

    table.uuid('company_id').notNullable().references('id').inTable('companies');
    table.specificType('frequency', 'recurrence_frequency').notNullable();
    table.timestamp('start_date', { useTz: true }).notNullable();
    table.timestamp('end_date', { useTz: true }).nullable();
    table.timestamp('next_run_date', { useTz: true }).nullable();
    table.json('placeholder_vars').nullable(); // Input - [Day], [Week], [Month], [Year], [Week Year], [Month Year]

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    addStandardColumns(knex, table);

    table.index(['frequency', 'next_run_date'], 'rjt_frequency_nextrun_idx');
  });

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
