import type { Knex } from 'knex';

const tableName = 'bank_account_connections';
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(tableName, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v7()'));

    table.string('provider_bank_account_id').notNullable(); // The account id from the provider

    table.string('provider_bank_account_secondary_id').nullable(); // The secondary id from the provider

    table
      .uuid('bank_account_id') // The bank account this connection belongs to
      .nullable()
      .references('id')
      .inTable('bank_accounts')
      .onDelete('CASCADE');

    table
      .uuid('provider_id') // The provider this connection belongs to
      .notNullable()
      .references('id')
      .inTable('bank_feed_providers')
      .onDelete('CASCADE');

    table.specificType('status', 'bank_account_connection_status').notNullable(); // active, revoked, pending, error
    // Add company_bank_credential_id to bank_account_connections for easier lookup
    table
      .uuid('company_bank_credential_id')
      .notNullable()
      .references('id')
      .inTable('company_bank_credentials')
      .onDelete('CASCADE');
    table.jsonb('raw_metadata'); // Connection specific metadata

    table.timestamp('last_sync_at').nullable(); // When data was last synced from provider
    table.timestamp('connected_at').notNullable().defaultTo(knex.fn.now()); // When connection was established

    table
      .uuid('created_by_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');

    table.unique(['provider_id', 'provider_bank_account_id']); // Prevent duplicate connections for same provider+account
    table.index(['bank_account_id', 'status']);
    table.index(['provider_id', 'status']);
    table.index('last_sync_at', 'idx_last_sync');
  });

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_connection_per_account
    ON bank_account_connections (bank_account_id) 
    WHERE status = 'active' AND bank_account_id IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_bank_account_connections_credential
    ON bank_account_connections (company_bank_credential_id, status)
    WHERE company_bank_credential_id IS NOT NULL;
  `);

  // await knex.schema.raw(`
  //   CREATE INDEX IF NOT EXISTS idx_bank_account_connections_credential
  //   ON bank_account_connections (company_bank_credential_id)
  //   WHERE company_bank_credential_id IS NOT NULL;
  // `);

  // await knex.schema.raw(`
  //   CREATE INDEX IF NOT EXISTS idx_staged_connections
  //   ON bank_account_connections (company_bank_credential_id, status)
  //   WHERE bank_account_id IS NULL;
  // `);

  // Add check constraint for status consistency
  await knex.schema.raw(`
      ALTER TABLE bank_account_connections ADD CONSTRAINT check_status_consistency
      CHECK (
        (bank_account_id IS NOT NULL AND status IN ('active', 'revoked', 'error'))
        OR
        (bank_account_id IS NULL AND status IN ('pending_resolution', 'pending'))
      );
    `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(tableName);
}
