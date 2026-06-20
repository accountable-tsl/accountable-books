import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const tableName = 'comms_deliveries';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const CHANNELS = ['email', 'sms', 'slack', 'google_chat', 'whatsapp'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const DELIVERY_MODES = ['immediate'] as const;
const STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'dead',
  'suppressed',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.text('idempotency_key').notNullable().unique({
      indexName: 'comms_deliveries_idempotency_unique',
    });
    table
      .string('channel', 32)
      .notNullable()
      .checkIn([...CHANNELS], 'comms_deliveries_channel_chk');
    table.text('provider_key').nullable();
    table.text('recipient_address').notNullable();
    table.text('template_key').notNullable();
    table.integer('template_version').notNullable();
    table
      .string('priority', 16)
      .notNullable()
      .checkIn([...PRIORITIES], 'comms_deliveries_priority_chk');
    table
      .string('delivery_mode', 16)
      .notNullable()
      .checkIn([...DELIVERY_MODES], 'comms_deliveries_mode_chk');
    table
      .string('status', 16)
      .notNullable()
      .checkIn([...STATUSES], 'comms_deliveries_status_chk');
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.text('provider_message_id').nullable();
    table.jsonb('provider_response').nullable();
    table.text('last_error').nullable();
    table.jsonb('correlation').notNullable();
    table
      .jsonb('payload_data')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .timestamp('queued_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('sent_at', { useTz: true }).nullable();
    table.timestamp('delivered_at', { useTz: true }).nullable();
    table.timestamp('failed_at', { useTz: true }).nullable();
    table.timestamp('next_attempt_at', { useTz: true }).nullable();
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
    'Comms-owned delivery audit log. Correlation is application-typed and intentionally not notification-shaped.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT comms_deliveries_template_version_positive_chk
        CHECK (template_version > 0),
      ADD CONSTRAINT comms_deliveries_attempt_count_nonnegative_chk
        CHECK (attempt_count >= 0),
      ADD CONSTRAINT comms_deliveries_correlation_shape_chk
        CHECK (
          jsonb_typeof(correlation) = 'object'
          AND jsonb_exists(correlation, 'source')
          AND jsonb_exists(correlation, 'id')
          AND correlation - 'source' - 'id' = '{}'::jsonb
          AND correlation->>'source' IN ('notification', 'admin_alert')
          AND jsonb_typeof(correlation->'id') = 'string'
        ),
      ADD CONSTRAINT comms_deliveries_payload_data_object_chk
        CHECK (jsonb_typeof(payload_data) = 'object'),
      ADD CONSTRAINT comms_deliveries_provider_response_object_chk
        CHECK (
          provider_response IS NULL
          OR jsonb_typeof(provider_response) = 'object'
        );
  `);

  await knex.raw(`
    CREATE INDEX comms_deliveries_status_next_attempt_idx
      ON ${qualifiedTable} (status, next_attempt_at)
      WHERE status IN ('queued', 'failed');

    CREATE INDEX comms_deliveries_correlation_idx
      ON ${qualifiedTable} ((correlation->>'source'), (correlation->>'id'));
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
