import type { Knex } from 'knex';

import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Recurring journal templates are company-owned scheduler configurations.
 * Each template defines a journal structure (description, entries, frequency)
 * that generates journal_batches on a schedule. Templates are user-editable
 * operational config; the generated journals and posted ledger transactions
 * are the accounting/audit artifacts.
 */

const schemaName = 'app';
const tableName = 'recurring_journal_templates';
const qualifiedTable = `"${schemaName}"."${tableName}"`;

const STATUSES = ['draft', 'active', 'paused', 'closed'] as const;
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.string('description', 512).notNullable();
    table.string('title', 512).nullable();
    table.string('note', 1000).nullable();

    table
      .text('status')
      .notNullable()
      .defaultTo('draft')
      .checkIn([...STATUSES]);

    table.boolean('auto_post').notNullable().defaultTo(false);

    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table.uuid('contact_id').nullable();

    table.text('template_timezone').notNullable();

    table
      .text('frequency')
      .notNullable()
      .checkIn([...FREQUENCIES]);
    table.timestamp('start_date', { useTz: true }).notNullable();
    table.timestamp('end_date', { useTz: true }).nullable();
    table.timestamp('next_run_date', { useTz: true }).nullable();

    table.integer('auto_reversal_days').nullable();

    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.timestamp('last_failed_at', { useTz: true }).nullable();
    table.text('last_error').nullable();
    table.integer('failure_count').notNullable().defaultTo(0);

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');
    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');
    table
      .uuid('deleted_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    addStandardColumns(knex, table);

    // Composite FKs - tenant isolation
    table
      .foreign(['contact_id', 'company_id'], 'rjt_contact_company_fk')
      .references(['id', 'company_id'])
      .inTable(`${schemaName}.contacts`)
      .onDelete('RESTRICT');

    // Composite FK target for template entries
    table.unique(['id', 'company_id']);

    table.index(['frequency', 'next_run_date'], 'rjt_frequency_nextrun_idx');
    table.index(
      ['company_id', 'status', 'next_run_date'],
      'rjt_company_status_nextrun_idx',
    );
  });

  await createUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
      'Company-owned recurring journal scheduler templates. Templates define editable automation config; generated journal batches and posted ledger transactions are the accounting records.';

    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT rjt_description_trimmed_chk CHECK (
        description = btrim(description) AND char_length(description) >= 1
      ),
      ADD CONSTRAINT rjt_title_trimmed_chk CHECK (
        title IS NULL OR title = btrim(title)
      ),
      ADD CONSTRAINT rjt_note_trimmed_chk CHECK (
        note IS NULL OR note = btrim(note)
      ),
      ADD CONSTRAINT rjt_template_tz_chk CHECK (
        "${schemaName}".is_valid_iana_timezone(template_timezone)
      ),
      ADD CONSTRAINT rjt_date_range_chk CHECK (
        end_date IS NULL OR end_date >= start_date
      ),
      ADD CONSTRAINT rjt_next_run_status_chk CHECK (
        (status = 'active' AND next_run_date IS NOT NULL) OR
        (status IN ('draft', 'closed') AND next_run_date IS NULL) OR
        status = 'paused'
      ),
      ADD CONSTRAINT rjt_auto_reversal_days_chk CHECK (
        auto_reversal_days IS NULL OR auto_reversal_days >= 1
      ),
      ADD CONSTRAINT rjt_failure_count_chk CHECK (
        failure_count >= 0
      ),
      ADD CONSTRAINT rjt_deleted_state_chk CHECK (
        (
          is_deleted = false
          AND deleted_at IS NULL
          AND deleted_by_id IS NULL
        ) OR (
          is_deleted = true
          AND deleted_at IS NOT NULL
          AND deleted_by_id IS NOT NULL
        )
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
