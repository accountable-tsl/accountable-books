import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_cron");

  // Verify pg_cron is actually installed
  const pgCronResult = await knex.raw(
    "SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'"
  );
  if (pgCronResult.rows.length === 0) {
    throw new Error("pg_cron extension not properly installed");
  }

  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP EXTENSION IF EXISTS "pgcrypto";`);

  await knex.raw("DROP EXTENSION IF EXISTS pg_cron");
}
