import type { Knex } from 'knex';
import { seedAdminUser, seedSystemUser } from './20250403184441_users';
import { createPlatformCompany } from './20250403194332_companies';
import { createPlatformFirm } from './20250403194335_accounting_firms_meta';
import { insertPlatformFirmCompany } from './20250403222519_client_firm_assignments';
import {
  assignAdminRole,
  assignSystemUserRole,
} from './20250403222517_user_company_roles';

const tableName = 'tokens';
export async function up(knex: Knex): Promise<void> {
  // TODO: Background job to delete old expired tokens
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.specificType('token_type', 'token_type').notNullable();
    table.string('token_hash').notNullable();
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .uuid('invitation_id')
      .nullable()
      .references('id')
      .inTable('user_invitations')
      .onDelete('CASCADE');

    table
      .uuid('company_id')
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');

    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('consumed_at', { useTz: true }).nullable();

    table.timestamp('updated_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Add a constraint to ensure either user_id or invitation_id is present, but not both
  await knex.raw(`
  ALTER TABLE tokens
  ADD CONSTRAINT token_user_or_invite_check
  CHECK (
    (user_id IS NOT NULL AND invitation_id IS NULL)
    OR
    (user_id IS NULL AND invitation_id IS NOT NULL)
  )
`);

  // Enforce One active token per token_type + user/invitation
  await knex.raw(`
  CREATE UNIQUE INDEX unique_active_token_per_user_per_type
  ON tokens (token_type, user_id)
  WHERE user_id IS NOT NULL AND consumed_at IS NULL
`);

  await knex.raw(`
  CREATE UNIQUE INDEX unique_active_token_per_invitation_per_type
  ON tokens (token_type, invitation_id)
  WHERE invitation_id IS NOT NULL AND consumed_at IS NULL
`);

  await seedAdminUser(knex);
  await seedSystemUser(knex);
  await createPlatformCompany(knex);
  await createPlatformFirm(knex);
  await assignAdminRole(knex);
  await assignSystemUserRole(knex);
  await insertPlatformFirmCompany(knex);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
