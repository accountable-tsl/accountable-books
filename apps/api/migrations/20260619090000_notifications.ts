import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const schemaName = 'app';
const notificationsTable = 'notifications';
const preferencesTable = 'notification_preferences';
const idempotencyTable = 'notification_idempotency_keys';

const qualifiedNotifications = `"${schemaName}"."${notificationsTable}"`;
const qualifiedPreferences = `"${schemaName}"."${preferencesTable}"`;
const qualifiedIdempotency = `"${schemaName}"."${idempotencyTable}"`;

const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const READ_POLICIES = ['auto_on_view', 'explicit'] as const;
const DELIVERY_MODES = ['off', 'immediate'] as const;
const PREFERENCE_OWNER_TYPES = ['user', 'company'] as const;
const ATTENTION_TRANSITIONS = [
  'opened',
  'routine_update',
  'material_update',
  'escalated',
  'reassigned',
  'overdue',
  'failed',
] as const;
const IDEMPOTENCY_EFFECTS = [
  'opened',
  'updated',
  'resolved',
  'suppressed',
  'external_only',
] as const;

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
      table
        .uuid('policy_owner_company_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');

      table.text('event_type').notNullable();
      table.text('attention_key').notNullable();
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
      table
        .string('last_attention_transition', 32)
        .notNullable()
        .checkIn(
          [...ATTENTION_TRANSITIONS],
          'notifications_attention_transition_chk',
        );

      table.timestamp('seen_at', { useTz: true }).nullable();
      table.timestamp('read_at', { useTz: true }).nullable();
      table.timestamp('resolved_at', { useTz: true }).nullable();
      table.timestamp('archived_at', { useTz: true }).nullable();
      table
        .timestamp('last_material_change_at', { useTz: true })
        .nullable();
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
      ADD CONSTRAINT notifications_attention_key_nonempty_chk
        CHECK (length(btrim(attention_key)) > 0),
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
        CHECK (work_item_subject_id IS NULL OR work_item_id IS NOT NULL),
      ADD CONSTRAINT notifications_policy_owner_scope_chk
        CHECK (
          (
            firm_company_id IS NULL
            AND client_company_id IS NULL
            AND policy_owner_company_id IS NULL
          )
          OR
          (
            (firm_company_id IS NOT NULL OR client_company_id IS NOT NULL)
            AND policy_owner_company_id IS NOT NULL
            AND (
              policy_owner_company_id = firm_company_id
              OR policy_owner_company_id = client_company_id
            )
          )
        );
  `);

  await knex.raw(`
    CREATE INDEX notifications_unread_by_recipient_idx
      ON ${qualifiedNotifications} (recipient_user_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND resolved_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_unread_client_scope_idx
      ON ${qualifiedNotifications} (recipient_user_id, client_company_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND resolved_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_unread_firm_scope_idx
      ON ${qualifiedNotifications} (recipient_user_id, firm_company_id, created_at DESC, id DESC)
      WHERE read_at IS NULL AND resolved_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_feed_by_recipient_idx
      ON ${qualifiedNotifications} (recipient_user_id, created_at DESC, id DESC)
      WHERE resolved_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_company_feed_idx
      ON ${qualifiedNotifications} (recipient_user_id, client_company_id, created_at DESC, id DESC)
      WHERE resolved_at IS NULL AND archived_at IS NULL;

    CREATE INDEX notifications_policy_owner_idx
      ON ${qualifiedNotifications} (policy_owner_company_id, event_type, created_at DESC, id DESC)
      WHERE policy_owner_company_id IS NOT NULL;

    CREATE UNIQUE INDEX notifications_active_attention_unique
      ON ${qualifiedNotifications} (recipient_user_id, attention_key)
      WHERE resolved_at IS NULL AND archived_at IS NULL;
  `);

  await createUpdateTimestampTrigger(knex, notificationsTable, schemaName);

  await knex.schema
    .withSchema(schemaName)
    .createTable(idempotencyTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('recipient_user_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('RESTRICT');
      table.text('idempotency_key').notNullable();
      table
        .uuid('notification_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.notifications`)
        .onDelete('SET NULL');
      table
        .string('effect', 24)
        .notNullable()
        .checkIn(
          [...IDEMPOTENCY_EFFECTS],
          'notification_idempotency_effect_chk',
        );
      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['recipient_user_id', 'idempotency_key'], {
        indexName: 'notification_idempotency_recipient_key_unique',
      });
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedIdempotency} IS
    'Notification lifecycle idempotency keys. One attention record can receive many idempotent lifecycle events.';

    CREATE INDEX notification_idempotency_notification_idx
      ON ${qualifiedIdempotency} (notification_id)
      WHERE notification_id IS NOT NULL;
  `);

  await createUpdateTimestampTrigger(knex, idempotencyTable, schemaName);

  await knex.schema
    .withSchema(schemaName)
    .createTable(preferencesTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
      table
        .uuid('user_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('RESTRICT');
      table
        .uuid('company_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');
      table
        .string('owner_type', 16)
        .notNullable()
        .checkIn(
          [...PREFERENCE_OWNER_TYPES],
          'notification_preferences_owner_type_chk',
        );
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
    });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedPreferences} IS
    'User and company notification preference overrides. Product defaults live in application code, not materialized rows.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedPreferences}
      ADD CONSTRAINT notification_preferences_type_format_chk
        CHECK (notification_type ~ '^[a-z0-9][a-z0-9_.-]*$'),
      ADD CONSTRAINT notification_preferences_channel_format_chk
        CHECK (channel ~ '^[a-z0-9][a-z0-9_-]*$'),
      ADD CONSTRAINT notification_preferences_owner_identity_chk
        CHECK (
          (
            owner_type = 'user'
            AND user_id IS NOT NULL
            AND company_id IS NULL
          )
          OR
          (
            owner_type = 'company'
            AND company_id IS NOT NULL
            AND user_id IS NULL
          )
        );

    CREATE INDEX notification_preferences_user_idx
      ON ${qualifiedPreferences} (user_id)
      WHERE owner_type = 'user';

    CREATE INDEX notification_preferences_company_idx
      ON ${qualifiedPreferences} (company_id)
      WHERE owner_type = 'company';

    CREATE UNIQUE INDEX notification_preferences_user_type_channel_unique
      ON ${qualifiedPreferences} (user_id, notification_type, channel)
      WHERE owner_type = 'user';

    CREATE UNIQUE INDEX notification_preferences_company_type_channel_unique
      ON ${qualifiedPreferences} (company_id, notification_type, channel)
      WHERE owner_type = 'company';
  `);

  await createUpdateTimestampTrigger(knex, preferencesTable, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, preferencesTable, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(preferencesTable);

  await dropUpdateTimestampTrigger(knex, idempotencyTable, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(idempotencyTable);

  await dropUpdateTimestampTrigger(knex, notificationsTable, schemaName);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(notificationsTable);
}
