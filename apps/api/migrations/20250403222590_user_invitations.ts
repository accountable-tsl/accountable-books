import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * User invitations represent an offer of a role within a company workspace.
 *
 * Expiry is derived from `expires_at`; status records explicit decisions such
 * as acceptance, rejection, or revocation. Invitation proof tokens live in the
 * tokens table.
 */

const schemaName = 'app';
const tableName = 'user_invitations';
const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'rejected',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));
    table.string('email', 254).notNullable();
    table
      .uuid('invited_by_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.companies`)
      .onDelete('CASCADE');

    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable(`${schemaName}.roles`)
      .onDelete('RESTRICT');

    table
      .string('status', 24)
      .notNullable()
      .checkIn([...INVITATION_STATUSES], 'user_invitations_status_check')
      .defaultTo('pending');

    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('accepted_at', { useTz: true }).nullable();
    table
      .uuid('accepted_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');
    table.timestamp('rejected_at', { useTz: true }).nullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table
      .uuid('revoked_by_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('RESTRICT');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ['status', 'expires_at'],
      'user_invitations_status_expires_at_idx',
    );
    table.index(
      ['company_id', 'status'],
      'user_invitations_company_status_idx',
    );
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT user_invitations_email_normalized_chk
    CHECK (
      email = lower(btrim(email))
      AND char_length(email) BETWEEN 3 AND 254
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT user_invitations_expiry_after_creation_chk
    CHECK (expires_at > created_at)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT user_invitations_lifecycle_chk
    CHECK (
      (
        status = 'pending'
        AND accepted_at IS NULL
        AND accepted_by_id IS NULL
        AND rejected_at IS NULL
        AND revoked_at IS NULL
        AND revoked_by_id IS NULL
      )
      OR
      (
        status = 'accepted'
        AND accepted_at IS NOT NULL
        AND accepted_at <= expires_at
        AND accepted_by_id IS NOT NULL
        AND rejected_at IS NULL
        AND revoked_at IS NULL
        AND revoked_by_id IS NULL
      )
      OR
      (
        status = 'rejected'
        AND accepted_at IS NULL
        AND accepted_by_id IS NULL
        AND rejected_at IS NOT NULL
        AND revoked_at IS NULL
        AND revoked_by_id IS NULL
      )
      OR
      (
        status = 'revoked'
        AND accepted_at IS NULL
        AND accepted_by_id IS NULL
        AND rejected_at IS NULL
        AND revoked_at IS NOT NULL
        AND revoked_by_id IS NOT NULL
      )
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT user_invitations_terminal_time_chk
    CHECK (
      (accepted_at IS NULL OR accepted_at >= created_at)
      AND (rejected_at IS NULL OR rejected_at >= created_at)
      AND (revoked_at IS NULL OR revoked_at >= created_at)
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_invitations_one_pending_per_company_email_idx
    ON "${schemaName}"."${tableName}" (company_id, lower(email))
    WHERE status = 'pending'
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
