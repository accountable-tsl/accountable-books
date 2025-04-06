import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_cron");

  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP EXTENSION IF EXISTS "pgcrypto";`);

  await knex.raw("DROP EXTENSION IF EXISTS pg_cron");
}
