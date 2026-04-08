import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

const grantsTable = 'company_support_access_grants';
const breakGlassTable = 'company_break_glass_sessions';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(grantsTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('support_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .uuid('granted_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.string('support_access_level').notNullable();
    table.string('status').notNullable().defaultTo('active');
    table.text('reason').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();

    table
      .uuid('revoked_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.text('revoke_reason').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE ${grantsTable}
      ADD CONSTRAINT ${grantsTable}_access_level_chk
        CHECK (support_access_level IN ('read_only', 'company_profile_write')),
      ADD CONSTRAINT ${grantsTable}_status_chk
        CHECK (status IN ('active', 'revoked', 'expired')),
      ADD CONSTRAINT ${grantsTable}_reason_len_chk
        CHECK (char_length(reason) BETWEEN 1 AND 500),
      ADD CONSTRAINT ${grantsTable}_revoke_reason_len_chk
        CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500),
      ADD CONSTRAINT ${grantsTable}_revoke_fields_chk
        CHECK (
          (status IN ('active', 'expired') AND revoked_at IS NULL AND revoked_by_user_id IS NULL AND revoke_reason IS NULL)
          OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
        );

    CREATE UNIQUE INDEX ${grantsTable}_active_company_support_user_uidx
      ON ${grantsTable} (company_id, support_user_id)
      WHERE status = 'active';

    CREATE INDEX ${grantsTable}_company_status_expires_idx
      ON ${grantsTable} (company_id, status, expires_at DESC);

    CREATE INDEX ${grantsTable}_support_user_status_expires_idx
      ON ${grantsTable} (support_user_id, status, expires_at DESC);

    CREATE INDEX ${grantsTable}_expires_idx
      ON ${grantsTable} (expires_at DESC);
  `);

  await createUpdateTimestampTrigger(knex, grantsTable);

  await knex.schema.createTable(breakGlassTable, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table
      .uuid('super_admin_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('status').notNullable().defaultTo('active');
    table.text('reason').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();

    table
      .uuid('closed_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('closed_at', { useTz: true }).nullable();
    table.text('close_reason').nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE ${breakGlassTable}
      ADD CONSTRAINT ${breakGlassTable}_status_chk
        CHECK (status IN ('active', 'closed', 'expired')),
      ADD CONSTRAINT ${breakGlassTable}_reason_len_chk
        CHECK (char_length(reason) BETWEEN 1 AND 500),
      ADD CONSTRAINT ${breakGlassTable}_close_reason_len_chk
        CHECK (close_reason IS NULL OR char_length(close_reason) <= 500),
      ADD CONSTRAINT ${breakGlassTable}_close_fields_chk
        CHECK (
          (status IN ('active', 'expired') AND closed_at IS NULL AND closed_by_user_id IS NULL AND close_reason IS NULL)
          OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL)
        );

    CREATE UNIQUE INDEX ${breakGlassTable}_active_company_uidx
      ON ${breakGlassTable} (company_id)
      WHERE status = 'active';

    CREATE INDEX ${breakGlassTable}_company_status_expires_idx
      ON ${breakGlassTable} (company_id, status, expires_at DESC);

    CREATE INDEX ${breakGlassTable}_super_admin_status_expires_idx
      ON ${breakGlassTable} (super_admin_user_id, status, expires_at DESC);

    CREATE INDEX ${breakGlassTable}_expires_idx
      ON ${breakGlassTable} (expires_at DESC);
  `);

  await createUpdateTimestampTrigger(knex, breakGlassTable);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, breakGlassTable);
  await dropUpdateTimestampTrigger(knex, grantsTable);
  await knex.schema.dropTableIfExists(breakGlassTable);
  await knex.schema.dropTableIfExists(grantsTable);
}
