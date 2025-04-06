import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function up(knex: Knex): Promise<void> {
  const sqlDir = path.join(__dirname, "sql");
  console.log("SQL Dir:", sqlDir); // Verify path

  const bankTransactionSql = await fs.readFile(
    path.join(sqlDir, "bank_transaction.sql"),
    "utf8"
  );

  const ledgerEntrySql = await fs.readFile(
    path.join(sqlDir, "ledger_entry.sql"),
    "utf8"
  );
  await knex.raw(bankTransactionSql);
  await knex.raw(ledgerEntrySql);
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle dependencies
  if (process.env.NODE_ENV !== "production") {
    await knex.raw("DROP TABLE IF EXISTS ledger_entry CASCADE");
    await knex.raw("DROP TABLE IF EXISTS bank_transaction CASCADE");
  } else {
    await knex.raw("DROP TABLE IF EXISTS ledger_entry");
    await knex.raw("DROP TABLE IF EXISTS bank_transaction");
  }
}
