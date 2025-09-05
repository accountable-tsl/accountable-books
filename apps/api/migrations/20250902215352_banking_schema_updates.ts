import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add company_bank_credential_id to bank_account_connections for easier lookup
  await knex.schema.alterTable('bank_account_connections', (table) => {
    table
      .uuid('company_bank_credential_id')
      .notNullable()
      .references('id')
      .inTable('company_bank_credentials')
      .onDelete('CASCADE');
  });

  // Create index for faster lookups
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_bank_account_connections_credential 
    ON bank_account_connections (company_bank_credential_id) 
    WHERE company_bank_credential_id IS NOT NULL;
  `);

  // Add unique constraint: No duplicate provider accounts per credential
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_provider_account_per_credential
    ON bank_account_connections (company_bank_credential_id, provider_bank_account_id);
  `);

  // Add check constraint for status consistency
  await knex.schema.raw(`
      ALTER TABLE bank_account_connections ADD CONSTRAINT check_status_consistency
      CHECK (
        (bank_account_id IS NOT NULL AND status IN ('active', 'revoked', 'error'))
        OR
        (bank_account_id IS NULL AND status IN ('pending_enrichment', 'pending_institution', 'error'))
      );
    `);

  // Add index for faster lookups of staged connections
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_staged_connections 
    ON bank_account_connections (company_bank_credential_id, status) 
    WHERE bank_account_id IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove indexes and constraints
  await knex.schema.raw('DROP INDEX IF EXISTS idx_staged_connections;');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_unique_provider_account_per_credential;');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_one_active_connection_per_account;');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_bank_account_connections_credential;');

  // Remove check constraint
  await knex.schema.raw(
    'ALTER TABLE bank_account_connections DROP CONSTRAINT IF EXISTS check_status_consistency;',
  );

  // Remove company_bank_credential_id column
  await knex.schema.alterTable('bank_account_connections', (table) => {
    table.dropColumn('company_bank_credential_id');
  });
}
