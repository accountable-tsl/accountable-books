import type { Knex } from 'knex';
import {
  addStandardColumns,
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const tableName = 'bank_accounts';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('display_name').notNullable();
    table.string('account_name').nullable();
    table.string('account_number').notNullable();
    table.string('account_number_mask').nullable();
    table
      .enu(
        'account_type',
        [
          'checkings_current',
          'savings',
          'utility',
          'credit_card',
          'debit_card',
          'other',
        ],
        { enumName: 'bank_account_type', useNative: true },
      )
      .nullable();
    table
      .enu('business_or_personal', ['business', 'personal'], {
        enumName: 'business_or_personal_account',
        useNative: true,
      })
      .nullable();
    table
      .uuid('bank_id')
      .notNullable()
      .references('id')
      .inTable('banks')
      .onDelete('RESTRICT');
    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable('currencies')
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');

    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable('coa')
      .onDelete('RESTRICT');
    table.jsonb('account_metadata').nullable().defaultTo('{}');
    // Provider & connection specific fields
    table
      .uuid('provider_id')
      .nullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('RESTRICT');

    table.string('provider_bank_account_id').nullable();

    table
      .enu(
        'connection_status',
        ['connected', 'revoked', 'error', 'not_connected'],
        {
          enumName: 'bank_account_connection_status',
          useNative: false,
        },
      )
      .notNullable();
    table
      .uuid('connection_credential_id')
      .nullable()
      .references('id')
      .inTable('bank_account_credentials')
      .onDelete('RESTRICT');

    table.timestamp('last_sync_at', { useTz: true }).nullable();
    table.text('sync_error').nullable();
    table.text('notes').nullable();

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.unique(['company_id', 'account_number']);

    addStandardColumns(knex, table);
  });

  // Add check constraints
  // If provider_id is not null, connection_status cannot be not_connected
  // if provider_id is null, connection_status must be not_connected
  // If provider_id is not null, provider_bank_account_id, connection_credential_id cannot be null
  await knex.raw(`
    ALTER TABLE bank_accounts ADD CONSTRAINT check_provider_connection_consistency
    CHECK (
      (provider_id IS NULL AND connection_status = 'not_connected') OR
      (provider_id IS NOT NULL AND connection_status != 'not_connected')
    );
  `);

  await knex.raw(`
    ALTER TABLE bank_accounts ADD CONSTRAINT check_provider_fields_consistency
    CHECK (
      (provider_id IS NULL) OR
      (provider_id IS NOT NULL AND provider_bank_account_id IS NOT NULL AND connection_credential_id IS NOT NULL)
    );
  `);

  await knex.raw(`
    CREATE INDEX idx_bank_accounts_provider ON bank_accounts(provider_id, provider_bank_account_id);
  `);

  await knex.raw(`
    CREATE INDEX idx_bank_accounts_connection_status ON bank_accounts(connection_status);
  `);

  await createUpdateTimestampTrigger(knex, tableName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName);
  await knex.schema.dropTableIfExists(tableName);

  await knex.raw(`DROP TYPE IF EXISTS business_or_personal_account`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_type`);
  await knex.raw(`DROP TYPE IF EXISTS bank_account_connection_status`);
}
