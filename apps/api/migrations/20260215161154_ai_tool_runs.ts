import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'ai_tool_runs';

const STATUSES = ['running', 'success', 'error'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('chat_run_id')
      .notNullable()
      .references('id')
      .inTable('ai_chat_runs')
      .onDelete('RESTRICT');

    table
      .uuid('approval_id')
      .nullable()
      .references('id')
      .inTable('ai_approvals')
      .onDelete('SET NULL');

    table.text('tool').notNullable();
    table.jsonb('tool_args').notNullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('running')
      .checkIn(STATUSES, 'ai_tool_runs_status_check');

    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('finished_at', { useTz: true }).nullable();

    table.text('error_text').nullable();
    table.jsonb('output').nullable();
    table.jsonb('metadata').notNullable().defaultTo('{}');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE INDEX ai_tool_runs_company_started_at_desc_idx
      ON ${tableName} (company_id, started_at DESC)
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ai_tool_runs_chat_run_started_at_desc_idx
      ON ${tableName} (chat_run_id, started_at DESC)
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ai_tool_runs_company_tool_started_at_desc_idx
      ON ${tableName} (company_id, tool, started_at DESC)
      WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
