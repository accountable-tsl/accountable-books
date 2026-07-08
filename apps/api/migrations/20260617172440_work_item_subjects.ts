import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * `work_item_subjects` are the exact fixable units underneath a grouped
 * `legacy_work_items` row. Their open/ended state is DERIVED from domain facts by the
 * materializer — the UI never marks a subject resolved directly. A subject ends
 * (status='ended') when the owning domain fact no longer requires action
 * (e.g. the bank transaction was posted).
 *
 * Canonical identity is `${required_action_intent}:${target_type}:${target_id}`
 * and at most one ACTIVE subject may exist per canonical_subject_key. The
 * action intent is part of the key so one physical row can back multiple
 * subjects only when the required action genuinely differs.
 */
const schemaName = 'app';
const tableName = 'work_item_subjects';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const STATUSES = ['active', 'ended'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('work_item_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.legacy_work_items`)
      .onDelete('CASCADE');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    // canonical_subject_key = `${required_action_intent}:${target_type}:${target_id}`
    table.text('canonical_subject_key').notNullable();
    table.text('required_action_intent').notNullable();
    table.text('target_type').notNullable();
    // Kept as text (not uuid) so future rollup/fingerprint subjects (e.g.
    // period_finding:{rollupFingerprint}) use the same column.
    table.text('target_id').notNullable();

    table
      .string('status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn([...STATUSES], 'work_item_subjects_status_chk');

    table.timestamp('ended_at', { useTz: true }).nullable();
    table.text('ended_reason').nullable();

    table.date('sort_date').nullable();
    table.decimal('amount', 18, 4).nullable();

    table
      .timestamp('first_seen_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('last_seen_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

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
    'Exact fixable units under a grouped work item; open/ended state derived from domain facts by the materializer.';
  `);

  // At most one active subject per canonical identity (one open owner).
  await knex.raw(`
    CREATE UNIQUE INDEX work_item_subjects_active_canonical_unique
      ON ${qualifiedTable} (canonical_subject_key)
      WHERE status = 'active' AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX work_item_subjects_work_item_status_idx
      ON ${qualifiedTable} (work_item_id, status);
  `);

  await knex.raw(`
    CREATE INDEX work_item_subjects_target_idx
      ON ${qualifiedTable} (target_type, target_id);
  `);

  // Ended subjects must carry an ended timestamp; active subjects must not.
  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT work_item_subjects_ended_state_chk
      CHECK (
        (status = 'active' AND ended_at IS NULL)
        OR
        (status = 'ended' AND ended_at IS NOT NULL)
      ),
      ADD CONSTRAINT work_item_subjects_deleted_state_chk
      CHECK (
        (is_deleted = false AND deleted_at IS NULL)
        OR
        (is_deleted = true AND deleted_at IS NOT NULL)
      );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
