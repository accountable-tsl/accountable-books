import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * `work_items` stores an independently finishable piece of work materialized
 * from source facts. It is a projection of those facts, never accounting truth.
 */
const schemaName = 'app';
const tableName = 'work_items';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const STATUSES = ['open', 'in_progress', 'closed', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');
    table
      .uuid('fiscal_period_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.fiscal_calendar`)
      .onDelete('RESTRICT');

    table.text('work_key').notNullable();
    table.text('family').notNullable();
    table.text('action_type').notNullable();
    table
      .string('status', 16)
      .notNullable()
      .defaultTo('open')
      .checkIn([...STATUSES], 'work_items_status_chk');

    // Root stays fixed as the target changes. Polymorphic: types live in code,
    // ids are plain uuids with no FK.
    table.text('root_type').notNullable();
    table.uuid('root_id').notNullable();
    table.text('target_type').notNullable();
    table.uuid('target_id').notNullable();

    table.uuid('assignee_id').nullable();
    table
      .string('priority', 16)
      .notNullable()
      .defaultTo('normal')
      .checkIn([...PRIORITIES], 'work_items_priority_chk');

    table.text('title').notNullable();

    table.text('state_hash').nullable();
    table.integer('version').notNullable().defaultTo(0);

    table
      .timestamp('opened_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('last_changed_at', { useTz: true })
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
  });

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT work_items_work_key_nonempty_chk
        CHECK (length(trim(work_key)) > 0),
      ADD CONSTRAINT work_items_version_nonnegative_chk
        CHECK (version >= 0),
      ADD CONSTRAINT work_items_closed_state_chk
        CHECK (
          (status IN ('open', 'in_progress') AND closed_at IS NULL)
          OR
          (status IN ('closed', 'cancelled') AND closed_at IS NOT NULL)
        );
  `);

  // One active work item per work_key; closed/cancelled rows keep the same key.
  await knex.raw(`
    CREATE UNIQUE INDEX work_items_active_work_key_unique
      ON ${qualifiedTable} (work_key)
      WHERE status IN ('open', 'in_progress');
  `);

  await knex.raw(`
    CREATE INDEX work_items_company_status_family_idx
      ON ${qualifiedTable} (company_id, status, family);
  `);

  await knex.raw(`
    CREATE INDEX work_items_root_idx
      ON ${qualifiedTable} (root_type, root_id);
  `);

  await knex.raw(`
    CREATE INDEX work_items_assignee_active_idx
      ON ${qualifiedTable} (assignee_id)
      WHERE assignee_id IS NOT NULL AND status IN ('open', 'in_progress');
  `);

  await knex.raw(`
    CREATE INDEX work_items_period_active_idx
      ON ${qualifiedTable} (fiscal_period_id)
      WHERE fiscal_period_id IS NOT NULL AND status IN ('open', 'in_progress');
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
