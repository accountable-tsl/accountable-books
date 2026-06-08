import type { Knex } from 'knex';

import {
  createUpdateTimestampTrigger,
  dropUpdateTimestampTrigger,
} from './utils/db.js';

/**
 * Short-lived proof tokens for security flows such as email verification,
 * invitation acceptance, and password reset.
 *
 * Tokens are stored only as hashes. Business state remains on the owning table
 * such as users or user_invitations.
 */

const schemaName = 'app';
const tableName = 'tokens';
const TOKEN_TYPES = [
  'email_verification',
  'user_invite',
  'password_reset',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(schemaName).createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table
      .string('token_type', 32)
      .notNullable()
      .checkIn([...TOKEN_TYPES], 'tokens_token_type_check');
    table.text('token_hash').notNullable();
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.users`)
      .onDelete('CASCADE');

    table
      .uuid('invitation_id')
      .nullable()
      .references('id')
      .inTable(`${schemaName}.user_invitations`)
      .onDelete('CASCADE');

    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['expires_at'], 'tokens_expires_at_idx');
    table.index(['user_id', 'token_type'], 'tokens_user_type_idx');
    table.index(['invitation_id', 'token_type'], 'tokens_invitation_type_idx');
  });

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT tokens_token_hash_not_blank_chk
    CHECK (token_hash = btrim(token_hash) AND char_length(token_hash) >= 32)
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT tokens_owner_by_type_chk
    CHECK (
      (
        token_type IN ('email_verification', 'password_reset')
        AND user_id IS NOT NULL
        AND invitation_id IS NULL
      )
      OR
      (
        token_type = 'user_invite'
        AND user_id IS NULL
        AND invitation_id IS NOT NULL
      )
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT tokens_lifecycle_order_chk
    CHECK (
      expires_at > created_at
      AND (consumed_at IS NULL OR consumed_at >= created_at)
      AND (revoked_at IS NULL OR revoked_at >= created_at)
    )
  `);

  await knex.raw(`
    ALTER TABLE "${schemaName}"."${tableName}"
    ADD CONSTRAINT tokens_terminal_state_chk
    CHECK (consumed_at IS NULL OR revoked_at IS NULL)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX tokens_one_outstanding_user_token_idx
    ON "${schemaName}"."${tableName}" (token_type, user_id)
    WHERE user_id IS NOT NULL
      AND consumed_at IS NULL
      AND revoked_at IS NULL
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX tokens_one_outstanding_invitation_token_idx
    ON "${schemaName}"."${tableName}" (token_type, invitation_id)
    WHERE invitation_id IS NOT NULL
      AND consumed_at IS NULL
      AND revoked_at IS NULL
  `);

  await createUpdateTimestampTrigger(knex, tableName, schemaName);
}

export async function down(knex: Knex): Promise<void> {
  await dropUpdateTimestampTrigger(knex, tableName, schemaName);
  await knex.schema.withSchema(schemaName).dropTableIfExists(tableName);
}
