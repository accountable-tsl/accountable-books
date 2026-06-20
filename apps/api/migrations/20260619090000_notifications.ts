import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const notificationsTable = 'notifications';
const preferencesTable = 'notification_preferences';

const qualifiedNotifications = `"${schemaName}"."${notificationsTable}"`;
const qualifiedPreferences = `"${schemaName}"."${preferencesTable}"`;

const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const READ_POLICIES = ['auto_on_view', 'explicit'] as const;
const DELIVERY_MODES = ['off', 'immediate'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(schemaName)
    .createTable(notificationsTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

      table
        .uuid('recipient_user_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('RESTRICT');

      table
        .uuid('firm_company_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');
      table
        .uuid('client_company_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');

      table.text('event_type').notNullable();
      table
        .string('priority', 16)
        .notNullable()
        .checkIn([...PRIORITIES], 'notifications_priority_chk');
      table
        .string('read_policy', 24)
        .notNullable()
        .checkIn([...READ_POLICIES], 'notifications_read_policy_chk');

      table.text('title').notNullable();
      table.text('body').nullable();
      table
        .jsonb('destination')
        .notNullable()
        .defaultTo(knex.raw(`'{}'::jsonb`));

      table.text('source_entity_type').nullable();
      table.uuid('source_entity_id').nullable();
      table.text('source_entity_key').nullable();

      table
        .uuid('activity_event_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.activity_events`)
        .onDelete('RESTRICT');
      table
        .uuid('work_item_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.work_items`)
        .onDelete('RESTRICT');
      table
        .uuid('work_item_subject_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.work_item_subjects`)
        .onDelete('RESTRICT');

      table.text('idempotency_key').notNullable();

      table.timestamp('seen_at', { useTz: true }).nullable();
      table.timestamp('read_at', { useTz: true }).nullable();
      table.timestamp('archived_at', { useTz: true }).nullable();
      table.timestamp('occurred_at', { useTz: true }).notNullable();
      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['recipient_user_id', 'idempotency_key'], {
        indexName: 'notifications_recipient_idempotency_unique',
      });
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedNotifications} IS
    'User-facing notification feed records with unread/read state. This is not a delivery log.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedNotifications}
      ADD CONSTRAINT notifications_event_type_format_chk
        CHECK (event_type ~ '^[a-z0-9][a-z0-9_.-]*$'),
      ADD CONSTRAINT notifications_destination_object_chk
        CHECK (jsonb_typeof(destination) = 'object'),
      ADD CONSTRAINT notifications_source_identity_chk
        CHECK (
          (
            source_entity_type IS NULL
            AND source_entity_id IS NULL
            AND source_entity_key IS NULL
          )
          OR
          (
            source_entity_type IS NOT NULL
            AND (
              (source_entity_id IS NOT NULL AND source_entity_key IS NULL)
              OR
              (source_entity_id IS NULL AND source_entity_key IS NOT NULL)
            )
          )
        ),
      ADD CONSTRAINT notifications_work_subject_requires_work_item_chk
        CHECK (work_item_subject_id IS NULL OR work_item_id IS NOT NULL);
  `);

  await knex.raw(`
    CREATE INDEX notifications_unread_by_recipient_idx
      ON ${qualifiedNotifications} (recipient_user_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_unread_client_scope_idx
      ON ${qualifiedNotifications} (recipient_user_id, client_company_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_unread_firm_scope_idx
      ON ${qualifiedNotifications} (recipient_user_id, firm_company_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_feed_by_recipient_idx
      ON ${qualifiedNotifications} (recipient_user_id, created_at DESC, id DESC)
      WHERE archived_at IS NULL;

    CREATE INDEX notifications_company_feed_idx
      ON ${qualifiedNotifications} (recipient_user_id, client_company_id, created_at DESC, id DESC)
      WHERE archived_at IS NULL;
  `);

  await createUpdateTimestampTrigger(knex, notificationsTable, schemaName);

  await knex.schema
    .withSchema(schemaName)
    .createTable(preferencesTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('user_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('RESTRICT');
      table.text('notification_type').notNullable();
      table.text('channel').notNullable();
      table
        .string('delivery_mode', 16)
        .notNullable()
        .checkIn([...DELIVERY_MODES], 'notification_preferences_mode_chk');
      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['user_id', 'notification_type', 'channel'], {
        indexName: 'notification_preferences_user_type_channel_unique',
      });
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedPreferences} IS
    'Per-user notification preference overrides. Defaults live in application code, not materialized rows.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedPreferences}
      ADD CONSTRAINT notification_preferences_type_format_chk
        CHECK (notification_type ~ '^[a-z0-9][a-z0-9_.-]*$'),
      ADD CONSTRAINT notification_preferences_channel_format_chk
        CHECK (channel ~ '^[a-z0-9][a-z0-9_-]*$');

    CREATE INDEX notification_preferences_user_idx
      ON ${qualifiedPreferences} (user_id);
  `);

  await createUpdateTimestampTrigger(knex, preferencesTable, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, preferencesTable, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(preferencesTable);

  await dropUpdateTimestampTrigger(knex, notificationsTable, schemaName);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(notificationsTable);
}
