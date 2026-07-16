import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const tableName = 'outbox';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const STATUSES = ['pending', 'processed', 'failed'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.text('intent_type').notNullable();
    table.text('scope_key').notNullable();
    table.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('pending')
      .checkIn([...STATUSES], 'outbox_status_chk');

    table
      .timestamp('available_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('lease_token')
      .nullable()
      .comment('Ownership token for long-running leased intents');

    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('dispatch_attempt_count').notNullable().defaultTo(0);
    table.text('last_error').nullable();
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
    'Transactional outbox: durable follow-up intents written atomically with domain facts.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT outbox_dispatch_attempt_count_chk
        CHECK (dispatch_attempt_count >= 0),
      ADD CONSTRAINT outbox_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object'),
      ADD CONSTRAINT outbox_intent_type_format_chk
        CHECK (
          intent_type = btrim(intent_type)
          AND intent_type ~ '^[a-z0-9_]+$'
        ),
      ADD CONSTRAINT outbox_scope_key_trimmed_chk
        CHECK (
          scope_key = btrim(scope_key)
          AND char_length(scope_key) >= 1
        ),
      ADD CONSTRAINT outbox_status_timestamps_chk
        CHECK (
          (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
          OR
          (status = 'processed' AND completed_at IS NOT NULL AND failed_at IS NULL)
          OR
          (status = 'failed' AND completed_at IS NOT NULL AND failed_at IS NOT NULL)
        );
  `);

  await knex.raw(`
    CREATE INDEX outbox_pending_available_idx
      ON ${qualifiedTable} (available_at, id)
      WHERE status = 'pending';
  `);

  // Debounce: one pending row per (intent_type, scope_key).
  await knex.raw(`
    CREATE UNIQUE INDEX outbox_pending_scope_unique
      ON ${qualifiedTable} (intent_type, scope_key)
      WHERE status = 'pending';
  `);

  await knex.raw(`
    CREATE INDEX outbox_completed_at_idx
      ON ${qualifiedTable} (completed_at)
      WHERE status IN ('processed', 'failed');
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
