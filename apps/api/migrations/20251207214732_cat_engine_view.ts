import { readFileSync } from 'fs';
import type { Knex } from 'knex';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function up(knex: Knex): Promise<void> {
  // Read and execute VIEW SQL
  const viewSql = readFileSync(
    join(__dirname, 'sql/categorization_engine_view.sql'),
    'utf-8',
  );
  await knex.raw(viewSql);

  // Create index for fiscal calendar queries (used in is_editable check)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_fc_company_type_status_span
      ON fiscal_calendar(company_id, period_type, status, period_span);
  `);

  // Create indexes for performance
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_bt_ledger_txn_id 
      ON bank_transactions(ledger_transaction_id) 
      WHERE is_deleted = false;
  `);

  // Note: bank_transactions doesn't have company_id directly,
  // so we index on bank_account_id instead (company_id is on bank_accounts)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_bt_account_date 
      ON bank_transactions(bank_account_id, date DESC) 
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cc_bank_txn_id 
      ON categorization_candidates(bank_transaction_id) 
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ccl_candidate_id 
      ON categorization_candidate_lines(candidate_id, is_bank_leg) 
      WHERE is_deleted = false;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_le_ledger_txn_id 
      ON ledger_entries(ledger_transaction_id, is_bank_leg) 
      WHERE is_deleted = false;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes
  await knex.raw(`DROP INDEX IF EXISTS idx_fc_company_type_status_span;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_le_ledger_txn_id;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_ccl_candidate_id;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cc_bank_txn_id;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_bt_account_date;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_bt_ledger_txn_id;`);

  // Drop view
  await knex.raw(`DROP VIEW IF EXISTS categorization_engine_view;`);
}
