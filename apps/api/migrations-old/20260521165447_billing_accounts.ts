import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'billing_accounts';

const BILLING_ACCOUNT_STATUSES = ['active', 'suspended', 'closed'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('owner_company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table.string('invoice_currency_code', 3).notNullable();

    table
      .string('status', 24)
      .notNullable()
      .defaultTo('active')
      .checkIn(BILLING_ACCOUNT_STATUSES, 'billing_accounts_status_check');

    table.integer('billing_cycle_anchor_day').nullable();

    table.text('billing_timezone').nullable();

    table
      .timestamp('current_billing_period_start_at', { useTz: true })
      .nullable();

    table
      .timestamp('current_billing_period_end_at', { useTz: true })
      .nullable();

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
    ADD CONSTRAINT billing_accounts_invoice_currency_code_check
    CHECK (invoice_currency_code ~ '^[A-Z]{3}$');
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_accounts_billing_cycle_anchor_day_check
    CHECK (
      billing_cycle_anchor_day IS NULL
      OR (billing_cycle_anchor_day >= 1 AND billing_cycle_anchor_day <= 31)
    );
  `);

  await knex.raw(`
    ALTER TABLE ${tableName}
    ADD CONSTRAINT billing_accounts_billing_period_window_check
    CHECK (
      current_billing_period_start_at IS NULL
      OR current_billing_period_end_at IS NULL
      OR current_billing_period_end_at > current_billing_period_start_at
    );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX billing_accounts_owner_company_id_unique_idx
    ON ${tableName} (owner_company_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);
}
