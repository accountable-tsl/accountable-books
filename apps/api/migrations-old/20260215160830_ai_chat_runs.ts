import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'ai_chat_runs';

const PROVIDERS = ['openai'] as const;
const STATUSES = ['running', 'success', 'error', 'aborted'] as const;

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

    table.text('capability_id').notNullable();
    table.text('domain').nullable();

    table
      .string('provider', 32)
      .notNullable()
      .checkIn(PROVIDERS, 'ai_chat_runs_provider_check');
    table.text('model').notNullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('running')
      .checkIn(STATUSES, 'ai_chat_runs_status_check');

    table.text('finish_reason').nullable();

    table.integer('request_message_count').notNullable().defaultTo(0);

    table.integer('input_tokens').nullable();
    table.integer('output_tokens').nullable();
    table.integer('total_tokens').nullable();

    // Micro-dollars (USD * 1e6). Keeps math exact and avoids float rounding.
    table.bigInteger('input_cost_usd_micros').nullable();
    table.bigInteger('output_cost_usd_micros').nullable();
    table.bigInteger('total_cost_usd_micros').nullable();

    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('finished_at', { useTz: true }).nullable();

    table.text('error_text').nullable();

    table.jsonb('metadata').notNullable().defaultTo('{}');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE INDEX ai_chat_runs_company_started_at_desc_idx
      ON ${tableName} (company_id, started_at DESC)
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ai_chat_runs_company_user_started_at_desc_idx
      ON ${tableName} (company_id, user_id, started_at DESC)
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX ai_chat_runs_company_capability_started_at_desc_idx
      ON ${tableName} (company_id, capability_id, started_at DESC)
      WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
