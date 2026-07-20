import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * One attempt to synchronize one bank account feed. Records trigger, outcome,
 * counts, timing, and structured failure classification. This is the durable
 * replacement for the old bank_accounts.sync_error column: the latest failure
 * is a query over runs, while current facts stay on the feed.
 */

const schemaName = 'app';
const tableName = 'bank_transaction_sync_runs';
const SYNC_TRIGGERS = [
  'initial_connection',
  'webhook',
  'scheduler',
  'manual',
] as const;
const SYNC_MODES = ['initial', 'incremental'] as const;
const SYNC_OUTCOMES = [
  'running',
  'succeeded',
  'failed',
  'skipped',
  'stale',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('bank_account_feed_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .string('trigger', 32)
      .notNullable()
      .checkIn([...SYNC_TRIGGERS], 'bank_transaction_sync_runs_trigger_chk');

    table.string('trace_id', 128).nullable();

    table
      .string('sync_mode', 16)
      .notNullable()
      .checkIn([...SYNC_MODES], 'bank_transaction_sync_runs_sync_mode_chk');

    table
      .timestamp('started_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();

    table
      .string('outcome', 16)
      .notNullable()
      .defaultTo('running')
      .checkIn([...SYNC_OUTCOMES], 'bank_transaction_sync_runs_outcome_chk');

    table.boolean('retryable').nullable();
    table.string('failure_classification', 128).nullable();
    table.string('provider_error_code', 128).nullable();
    table
      .string('diagnostic_summary', 2048)
      .nullable()
      .comment('Sanitized diagnostic text; never raw provider payloads');

    table.integer('page_count').nullable();
    table.integer('added_count').nullable();
    table.integer('modified_count').nullable();
    table.integer('removed_count').nullable();

    table
      .integer('observed_state_version')
      .notNullable()
      .comment('Feed state_version observed when the run started');

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .foreign(
        ['bank_account_feed_id', 'company_id'],
        'bank_transaction_sync_runs_feed_company_fk',
      )
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.bank_account_feeds`)
      .onDelete('RESTRICT');

    table.unique(
      ['id', 'bank_account_feed_id', 'company_id'],
      'bank_transaction_sync_runs_id_feed_company_uniq',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Durable history of individual bank feed sync attempts: trigger, outcome, counts, timing, and structured failure classification.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_transaction_sync_runs_completion_chk
        CHECK (
          (outcome = 'running' AND completed_at IS NULL)
          OR
          (outcome != 'running' AND completed_at IS NOT NULL)
        ),
      ADD CONSTRAINT bank_transaction_sync_runs_completed_after_start_chk
        CHECK (completed_at IS NULL OR completed_at >= started_at),
      ADD CONSTRAINT bank_transaction_sync_runs_counts_chk
        CHECK (
          (page_count IS NULL OR page_count >= 0)
          AND (added_count IS NULL OR added_count >= 0)
          AND (modified_count IS NULL OR modified_count >= 0)
          AND (removed_count IS NULL OR removed_count >= 0)
        ),
      ADD CONSTRAINT bank_transaction_sync_runs_observed_state_version_chk
        CHECK (observed_state_version >= 1),
      ADD CONSTRAINT bank_transaction_sync_runs_optional_text_trimmed_chk
        CHECK (
          (trace_id IS NULL
            OR (trace_id = btrim(trace_id) AND char_length(trace_id) >= 1))
          AND (failure_classification IS NULL
            OR (failure_classification = btrim(failure_classification) AND char_length(failure_classification) >= 1))
          AND (provider_error_code IS NULL
            OR (provider_error_code = btrim(provider_error_code) AND char_length(provider_error_code) >= 1))
          AND (diagnostic_summary IS NULL
            OR (diagnostic_summary = btrim(diagnostic_summary) AND char_length(diagnostic_summary) >= 1))
        );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
