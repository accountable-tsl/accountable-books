import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Users are the canonical identity records for authentication, onboarding,
 * company membership, and non-human system actors.
 */

const schemaName = 'app';
const tableName = 'users';
const USER_TYPES = ['demo', 'system', 'regular'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('firstname', 256).notNullable();
    table.string('lastname', 256).nullable();

    table
      .specificType('email', 'citext')
      .notNullable()
      .unique({ indexName: 'users_email_unique' });
    table.string('password', 512).nullable();
    table.string('phone_number', 32).nullable();
    table.string('avatar_url', 2048).nullable();
    table.string('avatar_key', 1024).nullable();

    table.timestamp('email_verified_at', { useTz: true }).nullable();
    table.jsonb('onboarding_state').nullable();
    table.timestamp('onboarding_completed_at', { useTz: true }).nullable();

    table.uuid('last_active_company_id').nullable();
    // .references("id")
    // .inTable("companies"); // Add foreign key after migrating companies table

    table
      .string('user_type', 24)
      .checkIn(USER_TYPES)
      .notNullable()
      .defaultTo('regular');

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
  });

  await knex.raw(`
    COMMENT ON TABLE "${schemaName}"."${tableName}" IS
    'Application user identities used for authentication, onboarding, workspace access, and internal system actors.';
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
      ADD CONSTRAINT users_email_trimmed_chk
        CHECK (email = btrim(email)),
      ADD CONSTRAINT users_deleted_state_chk
        CHECK (
          (is_deleted = false AND deleted_at IS NULL) OR
          (is_deleted = true AND deleted_at IS NOT NULL)
        );
  `);

  await knex.raw(`
    CREATE INDEX users_user_type_is_deleted_idx
      ON "${schemaName}"."${tableName}" (user_type, is_deleted);
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
