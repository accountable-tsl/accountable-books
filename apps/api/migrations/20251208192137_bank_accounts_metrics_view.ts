import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function up(knex: Knex): Promise<void> {
  // Read and execute VIEW SQL
  const viewSql = readFileSync(
    join(__dirname, 'views-sql/bank_accounts_metrics_view.sql'),
    'utf-8',
  );
  await knex.raw(viewSql);

  // Create indexes to support the view queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_bt_account_status 
      ON bank_transactions(bank_account_id, is_deleted, ledger_transaction_id) 
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cc_bank_txn_active 
      ON categorization_candidates(bank_transaction_id, is_deleted) 
      WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_cc_bank_txn_active;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_bt_account_status;`);
  await knex.raw(`DROP VIEW IF EXISTS bank_accounts_metrics_view;`);
}
