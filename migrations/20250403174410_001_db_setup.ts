import type { Knex } from "knex";

const REQUIRED_EXTENSIONS = ["pg_cron", "pgcrypto", "pg_uuidv7", "pg_trgm"];

export async function up(knex: Knex): Promise<void> {
  // Attempt to create all required extensions
  for (const ext of REQUIRED_EXTENSIONS) {
    await knex.raw(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
  }

  // Check if all required extensions were properly installed
  const installed = await knex
    .select("extname")
    .from("pg_extension")
    .whereIn("extname", REQUIRED_EXTENSIONS);

  const installedSet = new Set(installed.map((row) => row.extname));
  const missing = REQUIRED_EXTENSIONS.filter((ext) => !installedSet.has(ext));

  if (missing.length > 0) {
    throw new Error(
      `Missing required Postgres extensions: ${missing.join(", ")}`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const ext of [...REQUIRED_EXTENSIONS].reverse()) {
    await knex.raw(`DROP EXTENSION IF EXISTS "${ext}"`);
  }
}
