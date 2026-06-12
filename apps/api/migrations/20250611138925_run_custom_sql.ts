import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDir = path.join(__dirname, 'sql');

// Files that have their own dedicated migrations and should be excluded
const EXCLUDED_FILES = ['001_bank_transactions.sql', '002_ledger_entries.sql'];

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

  // Clean up utility functions created by the SQL files
  const functionsToDrop = [
    'update_timestamp',
    'prevent_update_or_delete',
  ];

  for (const funcName of functionsToDrop) {
    console.log(`Dropping function: ${funcName}`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${funcName} CASCADE`);
  }
}
