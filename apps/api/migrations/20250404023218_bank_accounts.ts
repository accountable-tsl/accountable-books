import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Company bank accounts (manual or provider-connected) linking to COA,
 * banks, currencies, and sync credentials. Central anchor for bank
 * transactions, balances, and categorization.
 */

const schemaName = 'app';
const tableName = 'bank_accounts';
const BANK_ACCOUNT_TYPES = [
  'checkings_current',
  'savings',
  'utility',
  'credit_card',
  'debit_card',
  'other',
] as const;
const BUSINESS_OR_PERSONAL = ['business', 'personal'] as const;
const CONNECTION_STATUSES = [
  'connected',
  'revoked',
  'error',
  'not_connected',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('display_name', 256).notNullable();
    table.string('account_name', 256).nullable();
    table.string('account_number', 64).notNullable();
    table.string('account_number_mask', 16).nullable();

    table
      .string('account_type', 32)
      .nullable()
      .checkIn([...BANK_ACCOUNT_TYPES], 'bank_accounts_account_type_chk');
    table
      .string('business_or_personal', 16)
      .nullable()
      .checkIn(
        [...BUSINESS_OR_PERSONAL],
        'bank_accounts_business_or_personal_chk',
      );

    table
      .uuid('bank_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.banks`)
      .onDelete('RESTRICT');

    table
      .uuid('currency_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.currencies`)
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('RESTRICT');

    table
      .uuid('coa_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.coa`)
      .onDelete('RESTRICT');

    table.jsonb('account_metadata').nullable();

    table
      .uuid('provider_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_feed_providers`)
      .onDelete('RESTRICT');

    table.string('provider_bank_account_id', 256).nullable();

    table
      .string('connection_status', 16)
      .notNullable()
      .defaultTo('not_connected')
      .checkIn([...CONNECTION_STATUSES], 'bank_accounts_connection_status_chk');

    table
      .uuid('connection_credential_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_account_credentials`)
      .onDelete('RESTRICT');
    table
      .foreign(
        ['connection_credential_id', 'company_id', 'provider_id'],
        'bank_accounts_credential_company_provider_fk',
      )
      .references(['id', 'company_id', 'provider_id'])
      .inTable(`${schemaName}.bank_account_credentials`)
      .onDelete('RESTRICT');

    table.timestamp('last_sync_at', { useTz: true }).nullable();
    table.string('sync_error', 2048).nullable();
    table.string('notes', 2048).nullable();

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
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.boolean('is_deleted').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.index(
      ['company_id', 'is_deleted'],
      'bank_accounts_company_id_is_deleted_idx',
    );
    table.index(
      ['provider_id', 'provider_bank_account_id'],
      'bank_accounts_provider_idx',
    );
    table.index(['connection_status'], 'bank_accounts_connection_status_idx');
    table.index(
      ['connection_credential_id'],
      'bank_accounts_connection_credential_id_idx',
    );
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Company bank accounts (manual or provider-connected) linking to COA, banks, and sync credentials.';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_accounts_company_bank_account_number_uniq
    ON "${schemaName}"."${tableName}" (company_id, bank_id, account_number)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX bank_accounts_active_coa_idx
    ON "${schemaName}"."${tableName}" (coa_id)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_accounts_provider_state_chk
        CHECK (
          (
            provider_id IS NULL
            AND provider_bank_account_id IS NULL
            AND connection_credential_id IS NULL
            AND connection_status = 'not_connected'
          )
          OR
          (
            provider_id IS NOT NULL
            AND provider_bank_account_id IS NOT NULL
            AND connection_credential_id IS NOT NULL
            AND connection_status != 'not_connected'
          )
        ),
      ADD CONSTRAINT bank_accounts_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL)
          OR
          (is_deleted = true AND deleted_at IS NOT NULL)
        ),
      ADD CONSTRAINT bank_accounts_display_name_trimmed_chk
        CHECK (
          display_name = btrim(display_name)
          AND char_length(display_name) >= 1
        ),
      ADD CONSTRAINT bank_accounts_account_number_trimmed_chk
        CHECK (
          account_number = btrim(account_number)
          AND char_length(account_number) >= 1
        ),
      ADD CONSTRAINT bank_accounts_optional_text_trimmed_chk
        CHECK (
          (account_name IS NULL
            OR (account_name = btrim(account_name) AND char_length(account_name) >= 1))
          AND (account_number_mask IS NULL
            OR (account_number_mask = btrim(account_number_mask) AND char_length(account_number_mask) >= 1))
          AND (provider_bank_account_id IS NULL
            OR (provider_bank_account_id = btrim(provider_bank_account_id) AND char_length(provider_bank_account_id) >= 1))
          AND (notes IS NULL
            OR (notes = btrim(notes) AND char_length(notes) >= 1))
          AND (sync_error IS NULL
            OR (sync_error = btrim(sync_error) AND char_length(sync_error) >= 1))
        );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
