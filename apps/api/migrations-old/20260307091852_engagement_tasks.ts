import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'engagement_tasks';

const STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
  'not_applicable',
];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const SOURCES = ['system_detected', 'manual'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('firm_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('client_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('workflow_run_id')
      .nullable()
      .references('id')
      .inTable('workflow_runs')
      .onDelete('SET NULL');

    // Task identity
    table.text('task_type').notNullable();
    table.text('task_category').notNullable();
    table.text('scope_type').notNullable();
    table.jsonb('scope_ref').nullable();

    // Status
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(STATUSES, 'engagement_tasks_status_check');

    // Blocker cache
    table.boolean('is_blocked').notNullable().defaultTo(false);
    table.boolean('has_warnings').notNullable().defaultTo(false);
    table.jsonb('blocking_summary').notNullable().defaultTo('[]');

    // Assignment
    table
      .uuid('assigned_to_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('assigned_at', { useTz: true }).nullable();
    table
      .uuid('assigned_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    // Timing
    table.date('due_date').nullable();
    table
      .string('priority', 10)
      .notNullable()
      .defaultTo('normal')
      .checkIn(PRIORITIES, 'engagement_tasks_priority_check');

    // Creation & resolution
    table
      .string('source', 20)
      .notNullable()
      .defaultTo('system_detected')
      .checkIn(SOURCES, 'engagement_tasks_source_check');
    table.text('source_entity_type').nullable();
    table.uuid('source_entity_id').nullable();

    table.timestamp('resolved_at', { useTz: true }).nullable();
    table
      .uuid('resolved_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('resolution_type').nullable();
    table.text('resolution_note').nullable();

    // Display & context
    table.text('title').notNullable();
    table.text('description').nullable();
    table.jsonb('metrics').notNullable().defaultTo('{}');

    // Audit
    table
      .uuid('created_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    addStandardColumns(knex, table);
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    CREATE UNIQUE INDEX engagement_tasks_natural_key
    ON ${tableName} (
      client_company_id,
      task_type,
      COALESCE(workflow_run_id, '00000000-0000-0000-0000-000000000000'),
      COALESCE(source_entity_id, '00000000-0000-0000-0000-000000000000')
    )
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX engagement_tasks_firm_status_due_idx
    ON ${tableName} (firm_company_id, status, due_date)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX engagement_tasks_workflow_run_status_idx
    ON ${tableName} (workflow_run_id, status)
    WHERE workflow_run_id IS NOT NULL AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX engagement_tasks_assigned_status_due_idx
    ON ${tableName} (assigned_to_user_id, status, due_date)
    WHERE assigned_to_user_id IS NOT NULL AND is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX engagement_tasks_client_type_idx
    ON ${tableName} (client_company_id, task_type)
    WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
