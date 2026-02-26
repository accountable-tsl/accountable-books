import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const THREADS_TABLE = 'ai_chat_threads';
const MESSAGES_TABLE = 'ai_chat_messages';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(THREADS_TABLE, (table) => {
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
    table.uuid('firm_id').nullable();
    table.text('title').nullable();
    table.timestamp('last_message_at', { useTz: true }).index();
    addStandardColumns(knex, table);

    // Index for fetching a user's thread list descending by activity
    table.index(['company_id', 'user_id'], 'idx_ai_chat_threads_company_user');
  });

  await createUpdateTimestampTrigger(knex, THREADS_TABLE);

  await knex.raw(`
    CREATE INDEX idx_ai_chat_threads_list
      ON ${THREADS_TABLE} (company_id, user_id, last_message_at DESC)
      WHERE is_deleted = false;
  `);

  await knex.schema.createTable(MESSAGES_TABLE, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table
      .uuid('thread_id')
      .notNullable()
      .references('id')
      .inTable(THREADS_TABLE)
      .onDelete('CASCADE')
      .index();

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
    table.uuid('firm_id').nullable();

    table.text('client_message_id').nullable();
    table.string('role', 50).notNullable(); // 'user' | 'assistant'
    table.text('text').notNullable();
    table.jsonb('meta').nullable();

    table
      .uuid('chat_run_id')
      .nullable()
      .references('id')
      .inTable('ai_chat_runs')
      .onDelete('SET NULL');

    table.timestamp('occurred_at', { useTz: true }).notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Idempotency constraint ensuring no duplicate client messages in the same thread
    table.unique(['thread_id', 'client_message_id']);

    // Index for ascending fetch of transcript
    table.index(['thread_id', 'occurred_at'], 'idx_ai_chat_msgs_transcript');

    // Index for audit queries
    table.index(
      ['company_id', 'user_id', 'created_at'],
      'idx_ai_chat_msgs_audit',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(MESSAGES_TABLE);
  await dropUpdateTimestampTrigger(knex, THREADS_TABLE);
  await knex.schema.dropTableIfExists(THREADS_TABLE);
}
