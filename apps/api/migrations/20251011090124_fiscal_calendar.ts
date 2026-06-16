import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Fiscal calendar defines each company's accounting periods and their close
 * status. These rows are structural accounting data used to validate posting
 * dates, materialize period balances, and power period-based reporting such as
 * trial balance and financial statements.
 */
const schemaName = 'app';
const tableName = 'fiscal_calendar';
const qualifiedTable = `"${schemaName}"."${tableName}"`;
const FISCAL_CALENDAR_STATUSES = ['open', 'closed', 'locked'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table.integer('fiscal_year').notNullable();
    table.integer('period_number').notNullable();
    table
      .specificType('period_type', `"${schemaName}"."fiscal_period_type"`)
      .notNullable();

    table.date('start_date').notNullable();
    table.date('end_date').notNullable();

    table.string('status', 16).notNullable().defaultTo('open');

    table.timestamp('closed_at', { useTz: true }).nullable();
    table
      .uuid('closed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table.timestamp('locked_at', { useTz: true }).nullable();
    table
      .uuid('locked_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .timestamp('status_changed_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .uuid('status_changed_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .jsonb('metadata')
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.primary(
      ['company_id', 'fiscal_year', 'period_number', 'period_type'],
      {
        constraintName: 'fiscal_calendar_pk',
      },
    );
  });

  await knex.raw(`
    COMMENT ON TABLE ${qualifiedTable} IS
    'Company-specific fiscal periods used for posting controls, period balance materialization, trial balance, and financial statement reporting.';
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD COLUMN period_span daterange
        GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED;
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT fiscal_calendar_status_chk
        CHECK (status IN (${FISCAL_CALENDAR_STATUSES.map((status) => `'${status}'`).join(', ')})),
      ADD CONSTRAINT fiscal_calendar_year_chk
        CHECK (fiscal_year BETWEEN 1900 AND 9999),
      ADD CONSTRAINT fiscal_calendar_period_number_chk
        CHECK (
          (period_type = 'monthly' AND period_number BETWEEN 1 AND 12)
          OR (period_type = 'quarterly' AND period_number BETWEEN 1 AND 4)
          OR (period_type = 'yearly' AND period_number = 1)
        ),
      ADD CONSTRAINT fiscal_calendar_dates_valid_chk
        CHECK (end_date >= start_date),
      ADD CONSTRAINT fiscal_calendar_status_metadata_chk
        CHECK (
          (
            status = 'open'
            AND closed_at IS NULL
            AND closed_by_id IS NULL
            AND locked_at IS NULL
            AND locked_by_id IS NULL
          )
          OR (
            status = 'closed'
            AND closed_at IS NOT NULL
            AND closed_by_id IS NOT NULL
            AND locked_at IS NULL
            AND locked_by_id IS NULL
          )
          OR (
            status = 'locked'
            AND closed_at IS NOT NULL
            AND closed_by_id IS NOT NULL
            AND locked_at IS NOT NULL
            AND locked_by_id IS NOT NULL
          )
        );
  `);

  await knex.raw(`
    ALTER TABLE ${qualifiedTable}
      ADD CONSTRAINT fiscal_calendar_no_overlap
      EXCLUDE USING GIST (
        company_id WITH =,
        period_type WITH =,
        period_span WITH &&
      )
      DEFERRABLE INITIALLY IMMEDIATE;
  `);

  await knex.raw(`
    CREATE INDEX fiscal_calendar_span_gist_idx
      ON ${qualifiedTable}
      USING GIST (company_id, period_type, period_span);

    CREATE INDEX fiscal_calendar_company_type_start_idx
      ON ${qualifiedTable} (company_id, period_type, start_date);

    CREATE INDEX fiscal_calendar_blocked_span_gist_idx
      ON ${qualifiedTable}
      USING GIST (company_id, period_type, period_span)
      WHERE status IN ('closed', 'locked');

    CREATE INDEX fiscal_calendar_closed_by_idx
      ON ${qualifiedTable} (closed_by_id)
      WHERE closed_by_id IS NOT NULL;

    CREATE INDEX fiscal_calendar_locked_by_idx
      ON ${qualifiedTable} (locked_by_id)
      WHERE locked_by_id IS NOT NULL;
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);

  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
