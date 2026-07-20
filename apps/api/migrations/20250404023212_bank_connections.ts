import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Bank connections represent one authorization relationship between a company
 * and a bank-feed provider (e.g. one Plaid item). A connection may expose
 * several bank accounts through bank_account_feeds. Authorization health lives
 * here; encrypted provider tokens live in bank_connection_secrets.
 */

const schemaName = 'app';
const tableName = 'bank_connections';
const AUTHORIZATION_STATUSES = [
  'active',
  'requires_action',
  'revoked',
] as const;
const REVOCATION_ORIGINS = ['client', 'provider'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table
      .uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.bank_feed_providers`)
      .onDelete('RESTRICT');

    table
      .string('provider_item_id', 256)
      .nullable()
      .comment('Provider-specific connection identifier (e.g. Plaid item_id)');

    table
      .uuid('bank_provider_mapping_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.bank_provider_mappings`)
      .onDelete('RESTRICT')
      .comment('Canonical provider-institution mapping, where resolved');

    table
      .string('authorization_status', 16)
      .notNullable()
      .defaultTo('active')
      .checkIn(
        [...AUTHORIZATION_STATUSES],
        'bank_connections_authorization_status_chk',
      );

    table
      .string('authorization_reason_code', 128)
      .nullable()
      .comment('Structured provider/internal reason for the current status');

    table.timestamp('requires_action_at', { useTz: true }).nullable();

    table
      .timestamp('connected_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('connected_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table.timestamp('revoked_at', { useTz: true }).nullable();

    table
      .uuid('revoked_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .string('revocation_origin', 16)
      .nullable()
      .checkIn(
        [...REVOCATION_ORIGINS],
        'bank_connections_revocation_origin_chk',
      );

    table.string('revocation_reason', 512).nullable();

    table
      .timestamp('provider_expires_at', { useTz: true })
      .nullable()
      .comment('Provider-side consent/token expiry, where known');

    table
      .jsonb('provider_snapshot')
      .nullable()
      .comment('Sanitized provider connection/institution snapshot');
    table.integer('provider_snapshot_version').nullable();
    table
      .timestamp('provider_snapshot_captured_at', { useTz: true })
      .nullable();

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .uuid('updated_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('SET NULL');

    table.unique(['id', 'company_id'], {
      indexName: 'bank_connections_id_company_uniq',
    });
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'One authorization relationship between a company and a bank-feed provider (e.g. a Plaid item). Owns the authorization lifecycle; encrypted tokens live in bank_connection_secrets.';
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX bank_connections_company_provider_item_uniq
    ON "${schemaName}"."${tableName}" (company_id, provider_id, provider_item_id)
    WHERE provider_item_id IS NOT NULL;
  `);

  await knex.raw(`
    CREATE INDEX bank_connections_provider_item_id_idx
    ON "${schemaName}"."${tableName}" (provider_item_id)
    WHERE provider_item_id IS NOT NULL;
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT bank_connections_optional_text_trimmed_chk
        CHECK (
          (provider_item_id IS NULL
            OR (provider_item_id = btrim(provider_item_id) AND char_length(provider_item_id) >= 1))
          AND (authorization_reason_code IS NULL
            OR (authorization_reason_code = btrim(authorization_reason_code) AND char_length(authorization_reason_code) >= 1))
          AND (revocation_reason IS NULL
            OR (revocation_reason = btrim(revocation_reason) AND char_length(revocation_reason) >= 1))
        ),
      ADD CONSTRAINT bank_connections_lifecycle_chk
        CHECK (
          (
            authorization_status = 'active'
            AND requires_action_at IS NULL
            AND authorization_reason_code IS NULL
            AND revoked_at IS NULL
            AND revoked_by_id IS NULL
            AND revocation_origin IS NULL
            AND revocation_reason IS NULL
          )
          OR
          (
            authorization_status = 'requires_action'
            AND requires_action_at IS NOT NULL
            AND revoked_at IS NULL
            AND revoked_by_id IS NULL
            AND revocation_origin IS NULL
            AND revocation_reason IS NULL
          )
          OR
          (
            authorization_status = 'revoked'
            AND requires_action_at IS NULL
            AND authorization_reason_code IS NULL
            AND revoked_at IS NOT NULL
            AND revocation_origin IS NOT NULL
          )
        ),
      ADD CONSTRAINT bank_connections_provider_snapshot_chk
        CHECK (
          (
            provider_snapshot IS NULL
            AND provider_snapshot_version IS NULL
            AND provider_snapshot_captured_at IS NULL
          )
          OR
          (
            provider_snapshot IS NOT NULL
            AND provider_snapshot_version IS NOT NULL
            AND provider_snapshot_captured_at IS NOT NULL
          )
        ),
      ADD CONSTRAINT bank_connections_provider_expiry_chk
        CHECK (provider_expires_at IS NULL OR provider_expires_at > connected_at);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
