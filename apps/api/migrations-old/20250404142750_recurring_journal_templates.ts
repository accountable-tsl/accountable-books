import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from '../migrations/utils/db.js';

const tableName = 'recurring_journal_templates';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('description', 512).notNullable();
    table.string('note', 1000).nullable();
    table
      .specificType('status', 'recurring_journal_status')
      .notNullable()
      .defaultTo('draft');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies');

    // Manual journals enhancements
    table.boolean('auto_post').notNullable().defaultTo(false);
    table.string('title', 512).nullable(); // Title template for generated journals
    table
      .uuid('currency_id')
      .nullable()
      .references('id')
      .inTable('currencies')
      .onDelete('SET NULL');
    table
      .uuid('contact_id')
      .nullable()
      .references('id')
      .inTable('contacts')
      .onDelete('SET NULL');

    table.text('template_timezone').notNullable();

    table.specificType('frequency', 'recurrence_frequency').notNullable();
    table.timestamp('start_date', { useTz: true }).notNullable();
    table.timestamp('end_date', { useTz: true }).nullable();
    table.timestamp('next_run_date', { useTz: true }).nullable();
    table.json('placeholder_vars').nullable(); // Input - [Day], [Week], [Month], [Year], [Week Year], [Month Year]

    table.integer('auto_reversal_days').nullable();

    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.timestamp('last_failed_at', { useTz: true }).nullable();
    table.text('last_error').nullable();
    table.integer('failure_count').notNullable().defaultTo(0);

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    addStandardColumns(knex, table);

    table.index(['frequency', 'next_run_date'], 'rjt_frequency_nextrun_idx');
    table.index(
      ['company_id', 'status', 'next_run_date'],
      'rjt_company_status_nextrun_idx',
    );
  });

  await createUpdateTimestampTrigger(knex, tableName);
  await knex.raw(
    `ALTER TABLE ${tableName} ADD CONSTRAINT rjt_template_tz_chk CHECK (template_timezone ~ '^[A-Za-z]+/[A-Za-z_]+$')`,
  );
  await knex.raw(
    `ALTER TABLE ${tableName} ADD CONSTRAINT rjt_auto_reversal_days_chk CHECK (auto_reversal_days IS NULL OR auto_reversal_days >= 1)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
