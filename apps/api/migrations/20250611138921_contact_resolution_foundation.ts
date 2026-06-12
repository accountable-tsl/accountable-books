import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';
import { createTrgmIndexes, dropTrgmIndexes } from './utils/trgmIndexes.js';

const schemaName = 'app';

const OBSERVED_COUNTERPARTY_SOURCES = [
  'bank_transaction',
  'bank_feed',
  'file_import',
  'manual_upload',
  'system',
] as const;

const CONTACT_ALIAS_SOURCES = [
  'user',
  'bank_counterparty',
  'rule',
  'import',
  'system',
] as const;

const CONTACT_ALIAS_VERIFICATION_STATUSES = [
  'system_inferred',
  'user_confirmed',
  'rejected',
] as const;

const RESOLUTION_STATUSES = [
  'unresolved',
  'ambiguous',
  'inferred',
  'confirmed',
  'manual_override',
  'ignored',
] as const;

const RESOLUTION_SOURCES = [
  'none',
  'observed_counterparty',
  'alias',
  'heuristic',
  'import',
  'rule',
  'user',
  'system',
] as const;

const observedCounterpartiesTable = 'observed_counterparties';
const contactAliasesTable = 'contact_aliases';
const resolutionsTable = 'bank_transaction_contact_resolutions';

function qualified(tableName: string): string {
  return `"${schemaName}"."${tableName}"`;
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema(schemaName)
    .createTable(observedCounterpartiesTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');

      table.string('observed_name', 512).notNullable();
      table.string('normalized_name', 512).notNullable();
      table.string('fingerprint', 128).notNullable();
      table
        .string('status', 32)
        .notNullable()
        .checkIn(['active', 'ignored'], 'observed_counterparties_status_chk')
        .defaultTo('active');
      table
        .string('source', 32)
        .notNullable()
        .checkIn(
          [...OBSERVED_COUNTERPARTY_SOURCES],
          'observed_counterparties_source_chk',
        );

      table.uuid('last_bank_transaction_id').nullable();

      table.integer('observation_count').notNullable().defaultTo(1);
      table
        .timestamp('first_observed_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('last_observed_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.jsonb('metadata').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));

      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['company_id', 'source', 'fingerprint']);
      table.unique(['id', 'company_id']);
      table.index(['company_id', 'normalized_name']);
      table.index(['company_id', 'last_observed_at']);
    });

  await knex.raw(`
    ALTER TABLE ${qualified(observedCounterpartiesTable)}
      ADD CONSTRAINT observed_counterparties_last_bank_transaction_fk
        FOREIGN KEY (last_bank_transaction_id, company_id)
        REFERENCES ${qualified('bank_transactions')} (id, company_id)
        ON DELETE SET NULL (last_bank_transaction_id),
      ADD CONSTRAINT observed_counterparties_name_trimmed_chk
        CHECK (
          observed_name = btrim(observed_name)
          AND char_length(observed_name) >= 1
          AND normalized_name = btrim(normalized_name)
          AND char_length(normalized_name) >= 1
          AND fingerprint = btrim(fingerprint)
          AND char_length(fingerprint) >= 1
        ),
      ADD CONSTRAINT observed_counterparties_observation_count_chk
        CHECK (observation_count >= 1),
      ADD CONSTRAINT observed_counterparties_seen_order_chk
        CHECK (last_observed_at >= first_observed_at);
  `);

  await knex.raw(`
    COMMENT ON TABLE ${qualified(observedCounterpartiesTable)} IS
    'Company-scoped counterparties observed from bank/import data before they are resolved to canonical contacts.';
  `);

  await knex.schema
    .withSchema(schemaName)
    .createTable(contactAliasesTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

      table
        .uuid('company_id')
        .notNullable()
        .references('id')
        .inTable(`${schemaName}.companies`)
        .onDelete('RESTRICT');

      table.uuid('contact_id').notNullable();
      table
        .foreign(['contact_id', 'company_id'], 'contact_aliases_contact_fk')
        .references(['id', 'company_id'])
        .inTable(`${schemaName}.contacts`)
        .onDelete('RESTRICT');

      table.uuid('observed_counterparty_id').nullable();
      table
        .foreign(
          ['observed_counterparty_id', 'company_id'],
          'contact_aliases_observed_counterparty_fk',
        )
        .references(['id', 'company_id'])
        .inTable(`${schemaName}.observed_counterparties`)
        .onDelete('RESTRICT');

      table.string('alias', 512).notNullable();
      table.string('normalized_alias', 512).notNullable();
      table
        .string('source', 32)
        .notNullable()
        .checkIn([...CONTACT_ALIAS_SOURCES], 'contact_aliases_source_chk');
      table.decimal('confidence', 5, 4).nullable();
      table
        .string('verification_status', 32)
        .notNullable()
        .checkIn(
          [...CONTACT_ALIAS_VERIFICATION_STATUSES],
          'contact_aliases_verification_status_chk',
        );
      table
        .uuid('verified_by_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('SET NULL');
      table.timestamp('verified_at', { useTz: true }).nullable();
      table.boolean('is_primary').notNullable().defaultTo(false);

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

      table.unique(
        ['id', 'company_id', 'contact_id'],
        'contact_aliases_id_company_contact_uniq',
      );
      table.index(['company_id', 'contact_id']);
      table.index(['company_id', 'observed_counterparty_id']);
    });

  await knex.raw(`
    ALTER TABLE ${qualified(contactAliasesTable)}
      ADD CONSTRAINT contact_aliases_alias_trimmed_chk
        CHECK (
          alias = btrim(alias)
          AND char_length(alias) >= 1
          AND normalized_alias = btrim(normalized_alias)
          AND char_length(normalized_alias) >= 1
        ),
      ADD CONSTRAINT contact_aliases_confidence_chk
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      ADD CONSTRAINT contact_aliases_verified_state_chk
        CHECK (
          (
            verification_status = 'system_inferred'
            AND verified_by_id IS NULL
            AND verified_at IS NULL
          )
          OR
          (
            verification_status IN ('user_confirmed', 'rejected')
            AND verified_at IS NOT NULL
          )
        ),
      ADD CONSTRAINT contact_aliases_deleted_state_chk
        CHECK (
          (
            is_deleted = false
            AND deleted_at IS NULL
            AND deleted_by_id IS NULL
          )
          OR
          (
            is_deleted = true
            AND deleted_at IS NOT NULL
          )
        );
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX contact_aliases_active_alias_uniq
      ON ${qualified(contactAliasesTable)} (company_id, normalized_alias)
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX contact_aliases_primary_contact_uniq
      ON ${qualified(contactAliasesTable)} (company_id, contact_id)
      WHERE is_deleted = false AND is_primary = true;
  `);

  await knex.raw(`
    COMMENT ON TABLE ${qualified(contactAliasesTable)} IS
    'Company-scoped aliases that map observed names or user-entered aliases to canonical contacts.';
  `);

  await knex.schema
    .withSchema(schemaName)
    .createTable(resolutionsTable, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

      table.uuid('bank_transaction_id').notNullable();
      table.uuid('company_id').notNullable();
      table
        .foreign(
          ['bank_transaction_id', 'company_id'],
          'bank_transaction_contact_resolutions_bank_transaction_fk',
        )
        .references(['id', 'company_id'])
        .inTable(`${schemaName}.bank_transactions`)
        .onDelete('CASCADE');

      table.uuid('observed_counterparty_id').nullable();
      table
        .foreign(
          ['observed_counterparty_id', 'company_id'],
          'bank_transaction_contact_resolutions_observed_counterparty_fk',
        )
        .references(['id', 'company_id'])
        .inTable(`${schemaName}.observed_counterparties`)
        .onDelete('RESTRICT');

      table.uuid('contact_id').nullable();
      table
        .foreign(
          ['contact_id', 'company_id'],
          'bank_transaction_contact_resolutions_contact_fk',
        )
        .references(['id', 'company_id'])
        .inTable(`${schemaName}.contacts`)
        .onDelete('RESTRICT');

      table.uuid('contact_alias_id').nullable();
      table
        .foreign(
          ['contact_alias_id', 'company_id', 'contact_id'],
          'bank_transaction_contact_resolutions_contact_alias_fk',
        )
        .references(['id', 'company_id', 'contact_id'])
        .inTable(`${schemaName}.contact_aliases`)
        .onDelete('RESTRICT');

      table.specificType('contact_type', 'contact_type').nullable();
      table
        .string('status', 32)
        .notNullable()
        .checkIn([...RESOLUTION_STATUSES], 'bt_contact_resolutions_status_chk')
        .defaultTo('unresolved');
      table
        .string('source', 32)
        .notNullable()
        .checkIn([...RESOLUTION_SOURCES], 'bt_contact_resolutions_source_chk')
        .defaultTo('none');
      table.decimal('confidence', 5, 4).nullable();
      table.string('resolution_reason', 512).nullable();

      table
        .uuid('resolved_by_id')
        .nullable()
        .references('id')
        .inTable(`${schemaName}.users`)
        .onDelete('SET NULL');
      table.timestamp('resolved_at', { useTz: true }).nullable();

      table
        .timestamp('created_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('updated_at', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.unique(['bank_transaction_id']);
      table.index(['company_id', 'status']);
      table.index(['company_id', 'contact_id']);
      table.index(['company_id', 'contact_type']);
      table.index(['company_id', 'observed_counterparty_id']);
    });

  await knex.raw(`
    ALTER TABLE ${qualified(resolutionsTable)}
      ADD CONSTRAINT bt_contact_resolutions_confidence_chk
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      ADD CONSTRAINT bt_contact_resolutions_reason_trimmed_chk
        CHECK (
          resolution_reason IS NULL
          OR (
            resolution_reason = btrim(resolution_reason)
            AND char_length(resolution_reason) >= 1
          )
        ),
      ADD CONSTRAINT bt_contact_resolutions_state_chk
        CHECK (
          (
            status IN ('unresolved', 'ignored', 'ambiguous')
            AND contact_id IS NULL
            AND contact_alias_id IS NULL
            AND contact_type IS NULL
          )
          OR
          (
            status IN ('inferred', 'confirmed', 'manual_override')
            AND contact_id IS NOT NULL
          )
        ),
      ADD CONSTRAINT bt_contact_resolutions_source_state_chk
        CHECK (
          (status = 'unresolved' AND source = 'none')
          OR (status != 'unresolved' AND source != 'none')
        ),
      ADD CONSTRAINT bt_contact_resolutions_resolved_state_chk
        CHECK (
          (
            status = 'unresolved'
            AND resolved_at IS NULL
          )
          OR
          (
            status != 'unresolved'
            AND resolved_at IS NOT NULL
          )
        );
  `);

  await knex.raw(`
    COMMENT ON TABLE ${qualified(resolutionsTable)} IS
    'Current company-scoped contact interpretation for each immutable bank transaction.';
  `);

  await createUpdateTimestampTrigger(
    knex,
    observedCounterpartiesTable,
    schemaName,
  );
  await createUpdateTimestampTrigger(knex, contactAliasesTable, schemaName);
  await createUpdateTimestampTrigger(knex, resolutionsTable, schemaName);

  await createTrgmIndexes(
    knex,
    observedCounterpartiesTable,
    ['observed_name', 'normalized_name'],
    'search_text',
    schemaName,
  );
  await createTrgmIndexes(
    knex,
    contactAliasesTable,
    ['alias', 'normalized_alias'],
    'search_text',
    schemaName,
  );
}

export async function down(knex: Knex): Promise<void> {
  await dropTrgmIndexes(knex, contactAliasesTable, 'search_text', schemaName);
  await dropTrgmIndexes(
    knex,
    observedCounterpartiesTable,
    'search_text',
    schemaName,
  );

  await dropUpdateTimestampTrigger(knex, resolutionsTable, schemaName);
  await dropUpdateTimestampTrigger(knex, contactAliasesTable, schemaName);
  await dropUpdateTimestampTrigger(
    knex,
    observedCounterpartiesTable,
    schemaName,
  );

  await knex.schema.withSchema(schemaName).dropTableIfExists(resolutionsTable);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(contactAliasesTable);
  await knex.schema
    .withSchema(schemaName)
    .dropTableIfExists(observedCounterpartiesTable);
}
