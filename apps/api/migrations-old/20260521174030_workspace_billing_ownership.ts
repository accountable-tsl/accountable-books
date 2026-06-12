import type { Knex } from 'knex';

import {
  addUserAuditColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'workspace_billing_ownership';

const COMMERCIAL_MODES = ['self_serve', 'firm_managed', 'firm_internal'];
const SOFTWARE_PAYERS = ['billing_account', 'client_billing_account'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('workspace_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('billing_account_id')
      .notNullable()
      .references('id')
      .inTable('billing_accounts')
      .onDelete('RESTRICT');

    table
      .uuid('client_billing_account_id')
      .nullable()
      .references('id')
      .inTable('billing_accounts')
      .onDelete('RESTRICT');

    table
      .string('commercial_mode', 32)
      .notNullable()
      .checkIn(
        COMMERCIAL_MODES,
        'workspace_billing_ownership_commercial_mode_check',
      );

    table
      .string('software_payer', 32)
      .notNullable()
      .checkIn(
        SOFTWARE_PAYERS,
        'workspace_billing_ownership_software_payer_check',
      );

    table
      .timestamp('effective_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.timestamp('ended_at', { useTz: true }).nullable();

    addUserAuditColumns(table, { includeDeletedBy: false });

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await createUpdateTimestampTrigger(knex, tableName);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT workspace_billing_ownership_time_window_check
    CHECK (ended_at IS NULL OR ended_at > effective_at);
  `);

  await knex.raw(`
    CREATE INDEX workspace_billing_ownership_workspace_company_id_idx
    ON ${tableName} (workspace_company_id);
  `);

  await knex.raw(`
    CREATE INDEX workspace_billing_ownership_billing_account_id_idx
    ON ${tableName} (billing_account_id);
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX workspace_billing_ownership_one_active_per_workspace_idx
    ON ${tableName} (workspace_company_id)
    WHERE ended_at IS NULL;
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT workspace_billing_ownership_no_overlapping_windows
    EXCLUDE USING gist (
      workspace_company_id WITH =,
      tstzrange(
        effective_at,
        COALESCE(ended_at, 'infinity'::timestamptz),
        '[)'
      ) WITH &&
    );
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT workspace_billing_ownership_phase2_software_payer_check
    CHECK (software_payer = 'billing_account');
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT workspace_billing_ownership_no_client_for_direct_modes_check
    CHECK (
      commercial_mode NOT IN ('self_serve', 'firm_internal')
      OR client_billing_account_id IS NULL
    );
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT workspace_billing_ownership_distinct_client_account_check
    CHECK (
      client_billing_account_id IS NULL
      OR client_billing_account_id <> billing_account_id
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
