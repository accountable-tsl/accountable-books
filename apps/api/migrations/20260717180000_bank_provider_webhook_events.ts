import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Durable Plaid webhook inbox. Events are stored then processed via outbox.
 * Dedupe keys are time-bucketed (buildWebhookDedupeKey) so identical steady-state
 * payloads do not permanently suppress later sync nudges.
 */

const schemaName = 'app';
const tableName = 'bank_provider_webhook_events';
const STATUSES = ['pending', 'completed', 'quarantined'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.text('provider_key').notNullable();
    table.text('provider_item_id').nullable();
    table.text('event_type').notNullable();
    table.text('event_code').notNullable();

    table.text('dedupe_key').notNullable();
    table.jsonb('payload').nullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('pending')
      .checkIn([...STATUSES], 'bank_provider_webhook_events_status_chk');

    table
      .timestamp('received_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true }).nullable();
    table.text('quarantine_reason').nullable();
    table.text('last_error').nullable();

    table
      .uuid('bank_connection_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_connections`)
      .onDelete('SET NULL');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(['provider_key', 'dedupe_key'], {
      indexName: 'bank_provider_webhook_events_provider_dedupe_uniq',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Durable provider webhook inbox: verify → store → ack → async process.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_provider_webhook_events_payload_object_chk
        CHECK (jsonb_typeof(payload) = 'object'),
      ADD CONSTRAINT bank_provider_webhook_events_status_timestamps_chk
        CHECK (
          (status = 'pending' AND processed_at IS NULL)
          OR
          (status IN ('completed', 'quarantined') AND processed_at IS NOT NULL)
        );
  `);

  await knex.raw(`
    CREATE INDEX bank_provider_webhook_events_status_received_idx
      ON "${schemaName}"."${tableName}" (status, received_at);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
