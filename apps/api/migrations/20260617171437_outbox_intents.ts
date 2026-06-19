import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Generic transactional outbox intents. Domain services write semantic follow-up
 * intents in the SAME database transaction as the business fact; workers
 * process them only after commit, so no follow-up effect runs against
 * rolled-back facts and none is silently lost between commit and enqueue.
 *
 * The table is deliberately intent-agnostic: `intent_type` + `scope_key` +
 * JSONB `payload` let later phases add `activity_event_requested`,
 * `notification_requested`, and `transaction_sync_requested` with no schema
 * change. Phase 1 only emits/handles `work_materialization_requested`.
 *
 * Debounce mechanism: a partial UNIQUE index on (intent_type, scope_key) WHERE
 * status = 'pending' collapses many pending intents for the same scope into a
 * single pending row, so a 100-transaction sync coalesces into a small number
 * of scope recomputes rather than 100 independent materializer runs.
 */
const schemaName = 'app';
const tableName = 'outbox_intents';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const STATUSES = ['pending', 'processed', 'failed'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    // Semantic intent. Kept as free text (not an enum) so new intent types can
    // be introduced without a migration; the application validates the value.
    table.text('intent_type').notNullable();

    // Stable reconciliation scope (e.g. bank_account:{companyId}:{accountId}).
    // Processing is debounced and serialized by this key.
    table.text('scope_key').notNullable();

    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('pending')
      .checkIn([...STATUSES], 'outbox_intents_status_chk');

    // Earliest time the intent may be dispatched (used for retry backoff).
    table
      .timestamp('available_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Set once the intent is no longer pending (processed or dead-lettered).
    table.timestamp('processed_at', { useTz: true }).nullable();

    table.integer('dispatch_attempt_count').notNullable().defaultTo(0);
    table.text('last_error').nullable();

    // Set when an intent is dead-lettered (exhausted max dispatch attempts).
    table.timestamp('failed_at', { useTz: true }).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Generic transactional outbox intents: durable, debounced, after-commit follow-up intents (work materialization, activity, notifications, sync hand-off).';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT outbox_intents_dispatch_attempt_count_chk
        CHECK (dispatch_attempt_count >= 0),
      ADD CONSTRAINT outbox_intents_status_timestamps_chk
        CHECK (
          (status = 'pending' AND processed_at IS NULL AND failed_at IS NULL)
          OR
          (status = 'processed' AND processed_at IS NOT NULL AND failed_at IS NULL)
          OR
          (status = 'failed' AND processed_at IS NOT NULL AND failed_at IS NOT NULL)
        );
  `);

  // Dispatch scan: pending rows whose backoff window has elapsed.
  await knex.raw(`
    CREATE INDEX outbox_intents_pending_available_idx
      ON ${qualifiedTable} (available_at)
      WHERE status = 'pending';
  `);

  // Debounce: at most one pending intent per (intent_type, scope_key).
  await knex.raw(`
    CREATE UNIQUE INDEX outbox_intents_pending_scope_unique
      ON ${qualifiedTable} (intent_type, scope_key)
      WHERE status = 'pending';
  `);

  await knex.raw(`
    CREATE INDEX outbox_intents_processed_at_idx
      ON ${qualifiedTable} (processed_at)
      WHERE status IN ('processed', 'failed');
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
