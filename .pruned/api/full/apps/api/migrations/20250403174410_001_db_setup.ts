import type { Knex } from 'knex';

const REQUIRED_EXTENSIONS_BASE = [
  'pg_cron',
  'pgcrypto',
  'pg_uuidv7',
  'pg_trgm',
  'vector',
  'pg_stat_statements',
  'citext',
  'unaccent',
];

export async function up(knex: Knex): Promise<void> {
  // Determine if pg_cron should be required for the current database
  const currentDbRes = await knex.raw('select current_database() as current_database');
  const current_database: string = currentDbRes?.rows?.[0]?.current_database;

  const cronRes = await knex.raw("SELECT current_setting('cron.database_name', true) as setting");
  const cronDatabase: string | null = cronRes?.rows?.[0]?.setting ?? null;

  const shouldRequirePgCron = cronDatabase === current_database;
  const REQUIRED_EXTENSIONS = REQUIRED_EXTENSIONS_BASE.filter(
    (ext) => ext !== 'pg_cron' || shouldRequirePgCron,
  );

  // Attempt to create required extensions (skip pg_cron if not applicable)
  for (const ext of REQUIRED_EXTENSIONS) {
    await knex.raw(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
  }

  // Check if all required extensions were properly installed
  const installed = await knex
    .select('extname')
    .from('pg_extension')
    .whereIn('extname', REQUIRED_EXTENSIONS);

  const installedSet = new Set(installed.map((row) => row.extname));
  const missing = REQUIRED_EXTENSIONS.filter((ext) => !installedSet.has(ext));

  if (missing.length > 0) {
    throw new Error(`Missing required Postgres extensions: ${missing.join(', ')}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const ext of [...REQUIRED_EXTENSIONS].reverse()) {
    await knex.raw(`DROP EXTENSION IF EXISTS "${ext}"`);
  }
}
