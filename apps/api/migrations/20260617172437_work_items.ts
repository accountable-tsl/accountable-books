import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * `work_items` are the grouped, actionable rows users see in the firm queue.
 * They are materialized PROJECTIONS of domain truth, never the source of
 * accounting truth: the materializer reconciles them from current domain facts
 * (see work-materialization.ts) and closes a row only when its active subject
 * count reaches zero.
 *
 * Rows are system-materialized, so there is no user author. Timestamp and
 * soft-delete columns are explicit below; user-audit columns are deliberately
 * omitted.
 */
const schemaName = 'app';
const tableName = 'work_items';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const STATUSES = ['open', 'closed'] as const;
const ACTIONABILITY_STATES = [
  'actionable_now',
  'blocked_by_client',
  'blocked_by_dependency',
  'waiting_on_system',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('firm_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    // e.g. 'categorize_transactions'. Free text + application vocabulary.
    table.text('work_type').notNullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('open')
      .checkIn([...STATUSES], 'work_items_status_chk');

    // Stored effective owner. NULL == firm-level / unassigned pool.
    table
      .uuid('assigned_user_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    // Materializer scope this row was grouped within (e.g. bank_account:...).
    table.text('scope_type').nullable();
    table.text('scope_key').nullable();

    // Display + action contract (resolved per-viewer in the API layer).
    table.text('title').nullable();
    table.text('primary_action').nullable();
    table
      .string('actionability_state', 32)
      .notNullable()
      .defaultTo('actionable_now')
      .checkIn([...ACTIONABILITY_STATES], 'work_items_actionability_chk');

    table.jsonb('destination').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    table
      .jsonb('required_capabilities')
      .notNullable()
      .defaultTo(knex.raw(`'[]'::jsonb`));
    table
      .jsonb('available_actions')
      .notNullable()
      .defaultTo(knex.raw(`'[]'::jsonb`));

    // Subject roll-up counters, recomputed by the materializer from
    // work_item_subjects inside the locked reconcile transaction.
    table.integer('subject_count').notNullable().defaultTo(0);
    table.integer('active_subject_count').notNullable().defaultTo(0);

    // Stable grouping identity composed by the materializer.
    table.text('group_key').notNullable();

    table
      .timestamp('first_seen_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('last_seen_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.timestamp('closed_at', { useTz: true }).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Grouped, actionable firm-queue rows materialized from domain facts; closed only when active subject count reaches zero.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT work_items_counts_nonnegative_chk
        CHECK (subject_count >= 0 AND active_subject_count >= 0),
      ADD CONSTRAINT work_items_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR
          (is_deleted = true AND deleted_at IS NOT NULL)
        );
  `);

  // One open grouped row per grouping identity.
  await knex.raw(`
    CREATE UNIQUE INDEX work_items_open_group_unique
      ON ${qualifiedTable} (group_key)
      WHERE status = 'open' AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX work_items_firm_open_type_idx
      ON ${qualifiedTable} (firm_company_id, work_type, first_seen_at)
      WHERE status = 'open' AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX work_items_client_open_type_idx
      ON ${qualifiedTable} (client_company_id, work_type)
      WHERE status = 'open' AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX work_items_assigned_open_idx
      ON ${qualifiedTable} (assigned_user_id)
      WHERE status = 'open' AND is_deleted = false AND assigned_user_id IS NOT NULL;
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
