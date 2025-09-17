import type { Knex } from 'knex';

const tableName = 'bank_account_credentials';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(tableName, (table) => {
    // Provider-agnostic sync fields
    table
      .text('sync_cursor')
      .nullable()
      .comment('Provider-specific sync cursor/token');
    table
      .jsonb('sync_state')
      .nullable()
      .defaultTo('{}')
      .comment('Provider-specific sync state');
    table
      .boolean('initial_sync_completed')
      .defaultTo(false)
      .comment('Whether initial transaction sync is done');
    table
      .date('transactions_from_date')
      .nullable()
      .comment('User preference for transaction sync start date');
    table
      .timestamp('last_transactions_sync_at', { useTz: true })
      .nullable()
      .comment('Last successful transaction sync timestamp');
  });

  // Add index for finding credentials that need syncing
  await knex.raw(`
    CREATE INDEX idx_credentials_sync_status 
    ON ${tableName} (company_id, status, initial_sync_completed, last_transactions_sync_at)
    WHERE status = 'active';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop the index first
  await knex.raw(`DROP INDEX IF EXISTS idx_credentials_sync_status;`);

  await knex.schema.alterTable(tableName, (table) => {
    table.dropColumn('sync_cursor');
    table.dropColumn('sync_state');
    table.dropColumn('initial_sync_completed');
    table.dropColumn('transactions_from_date');
    table.dropColumn('last_transactions_sync_at');
  });
}
