import type { Knex } from "knex";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDir = path.join(__dirname, "sql");
console.log("SQL Dir:", sqlDir); // Verify path

export async function up(knex: Knex): Promise<void> {
  const files = (await fs.readdir(sqlDir)).filter((f) => f.endsWith(".sql"));
  const sorted = files.sort();

  for (const file of sorted) {
    const sql = await fs.readFile(path.join(sqlDir, file), "utf8");
    console.log(`Applying: ${file}`);
    await knex.raw(sql);
  }
}

export async function down(knex: Knex): Promise<void> {
  const files = (await fs.readdir(sqlDir)).filter((f) => f.endsWith(".sql"));
  const sorted = files.sort().reverse(); // reverse order for safe teardown

  for (const file of sorted) {
    const base = file.replace(/^\d+_/, "").replace(".sql", "");

    console.log(`Dropping: ${base}`);
    await knex.raw(`DROP TABLE IF EXISTS ${base} CASCADE`);
  }
}
