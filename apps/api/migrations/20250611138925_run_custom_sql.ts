import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDir = path.join(__dirname, 'sql');
console.log('SQL Dir:', sqlDir); // Verify path

// Files that have their own dedicated migrations and should be excluded
const EXCLUDED_FILES = [''];

export async function up(knex: Knex): Promise<void> {
  const files = (await fs.readdir(sqlDir))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !EXCLUDED_FILES.includes(f));
  const sorted = files.sort();

  for (const file of sorted) {
    const sql = await fs.readFile(path.join(sqlDir, file), 'utf8');
    console.log(`Applying: ${file}`);
    await knex.raw(sql);
  }
}

export async function down(knex: Knex): Promise<void> {
  const files = (await fs.readdir(sqlDir))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !EXCLUDED_FILES.includes(f));
  const sorted = files.sort().reverse(); // reverse order for safe teardown

  for (const file of sorted) {
    const base = file.replace(/^\d+_/, '').replace('.sql', '');

    console.log(`Dropping: ${base}`);
    await knex.raw(`DROP TABLE IF EXISTS ${base} CASCADE`);
  }

  // Clean up all functions created by the SQL files
  const functionsToDrop = [
    // Bank transactions functions
    'safe_attach_partition_index',
    'ensure_bt_leaf_indexes_for_year',
    'ensure_bt_leaf_indexes_before_2024',
    'ensure_month_partition',
    'ensure_year_partition',
    'create_bank_transactions_partitions',
    'bt_ensure_partition_before_insert',
    'drain_bank_transactions_default',
    'schedule_bank_transactions_partition_cron',
    'guard_bank_transactions_update',
    'prevent_bank_transactions_delete',

    // Ledger entries functions
    'ensure_le_leaf_indexes_for_year',
    'ensure_le_leaf_indexes_before_2024',
    'ensure_ledger_month_partition',
    'ensure_ledger_year_partition',
    'create_ledger_entries_partitions',
    'le_ensure_partition_before_insert',
    'drain_ledger_entries_default',
    'schedule_ledger_entries_partition_cron',
    'guard_ledger_entries_update',
    'prevent_ledger_entries_delete',

    // Platform functions
    'prevent_platform_flag_update',

    // Utility functions (may be created by multiple migrations)
    'update_timestamp',
    'prevent_update_or_delete',
  ];

  for (const funcName of functionsToDrop) {
    console.log(`Dropping function: ${funcName}`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${funcName} CASCADE`);
  }
}
