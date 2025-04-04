import type { Knex } from "knex";

exports.up = async (knex: Knex) => {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_cron");
};

exports.down = async (knex: Knex) => {
  await knex.raw("DROP EXTENSION IF EXISTS pg_cron CASCADE");
};
