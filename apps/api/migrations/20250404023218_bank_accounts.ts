import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Durable company bank accounts linked to the chart of accounts. Provider
 * connection, provider account identity, and sync state live on
 * bank_connections / bank_account_feeds; this table is provider-agnostic and
 * survives connection failure or revocation. Manual accounts are also bank
 * accounts.
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

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('display_name', 256).notNullable();
    table
      .string('official_name', 256)
      .nullable()
      .comment('Official account holder/account name at the bank');
    table.string('account_number_mask', 16).nullable();
    table
      .string('account_number_fingerprint', 128)
      .nullable()
      .comment(
        'HMAC blind index of the normalized account number (hex); never a plaintext hash',
      );
    table.integer('account_number_fingerprint_version').nullable();

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
    table.unique(['id', 'company_id'], 'bank_accounts_id_company_uniq');
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Durable, provider-agnostic company bank accounts linked to the COA. Provider identity and sync state live on bank_connections/bank_account_feeds.';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_accounts_company_bank_fingerprint_uniq
    ON "${schemaName}"."${tableName}" (company_id, bank_id, account_number_fingerprint)
    WHERE is_deleted = false AND account_number_fingerprint IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX bank_accounts_active_coa_idx
    ON "${schemaName}"."${tableName}" (coa_id)
    WHERE is_deleted = false;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
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
      ADD CONSTRAINT bank_accounts_fingerprint_pair_chk
        CHECK (
          (
            account_number_fingerprint IS NULL
            AND account_number_fingerprint_version IS NULL
          )
          OR
          (
            account_number_fingerprint IS NOT NULL
            AND account_number_fingerprint_version IS NOT NULL
          )
        ),
      ADD CONSTRAINT bank_accounts_optional_text_trimmed_chk
        CHECK (
          (official_name IS NULL
            OR (official_name = btrim(official_name) AND char_length(official_name) >= 1))
          AND (account_number_mask IS NULL
            OR (account_number_mask = btrim(account_number_mask) AND char_length(account_number_mask) >= 1))
          AND (account_number_fingerprint IS NULL
            OR (account_number_fingerprint = btrim(account_number_fingerprint) AND char_length(account_number_fingerprint) >= 1))
        );
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
