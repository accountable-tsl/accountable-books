import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'workflow_runs';

const DOMAIN_AREAS = ['bookkeeping', 'tax', 'audit'];
const PERIOD_TYPES = ['monthly', 'quarterly', 'yearly'];
const SOURCES = ['system_detected', 'manual'];
const STATUSES = [
  'not_started',
  'in_progress',
  'review_requested',
  'under_review',
  'approved',
  'sent',
  'closed',
];

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
      .string('domain_area', 20)
      .notNullable()
      .checkIn(DOMAIN_AREAS, 'workflow_runs_domain_area_check');

    table.integer('fiscal_year').notNullable();
    table.integer('period_number').notNullable();
    table
      .string('period_type', 12)
      .notNullable()
      .defaultTo('monthly')
      .checkIn(PERIOD_TYPES, 'workflow_runs_period_type_check');

    table
      .string('status', 20)
      .notNullable()
      .defaultTo('not_started')
      .checkIn(STATUSES, 'workflow_runs_status_check');

    // Milestone timestamps (reflect the current/latest review cycle)
    table.timestamp('work_started_at', { useTz: true }).nullable();

    table.timestamp('review_requested_at', { useTz: true }).nullable();
    table
      .uuid('review_requested_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('approved_at', { useTz: true }).nullable();
    table
      .uuid('approved_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('sent_at', { useTz: true }).nullable();
    table
      .uuid('sent_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('closed_at', { useTz: true }).nullable();
    table
      .uuid('closed_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    // Tracks how many review cycles this run has been through
    table.integer('review_cycle').notNullable().defaultTo(0);

    // Ownership & timing
    table
      .uuid('assigned_to_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.date('due_date').nullable();

    // Creation source
    table
      .string('source', 20)
      .notNullable()
      .defaultTo('system_detected')
      .checkIn(SOURCES, 'workflow_runs_source_check');

    table.jsonb('metadata').notNullable().defaultTo('{}');

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
    CREATE UNIQUE INDEX workflow_runs_natural_key
    ON ${tableName} (client_company_id, domain_area, fiscal_year, period_number, period_type)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX workflow_runs_firm_status_idx
    ON ${tableName} (firm_company_id, status)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX workflow_runs_client_domain_idx
    ON ${tableName} (client_company_id, domain_area)
    WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
