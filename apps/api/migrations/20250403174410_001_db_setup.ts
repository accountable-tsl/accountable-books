import type { Knex } from 'knex';

const ENV = (process.env.NODE_ENV || 'local').toLowerCase();
const IS_LOCAL = ENV === 'local' || ENV === 'development';
const IS_TEST = ENV === 'test';

const BASE = ['pgcrypto', 'pg_uuidv7', 'pg_trgm', 'vector', 'citext', 'unaccent'];

const CANDIDATE_EXTENSIONS = IS_LOCAL ? [...BASE, 'pg_cron'] : BASE;

export async function up(knex: Knex): Promise<void> {
  // Only create extensions in local environments
  if (!IS_LOCAL && !IS_TEST) {
    console.log('Skipping extension creation...');
    return;
  }

  // What is actually available on this server?
  const rows = await knex.select('name').fromRaw('pg_available_extensions');
  const available = new Set<string>(rows.map((r: any) => r.name));

  // Only attempt to create what exists on this server
  const toCreate = CANDIDATE_EXTENSIONS.filter((ext) => available.has(ext));

  for (const ext of toCreate) {
    await knex.raw(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
  }

  // Verify installation of the ones we attempted
  const installedRows = await knex.select('extname').from('pg_extension');
  const installed = new Set<string>(installedRows.map((r: any) => r.extname));
  const missing = toCreate.filter((ext) => !installed.has(ext));

  if (missing.length > 0) {
    throw new Error(`Expected extensions not installed: ${missing.join(', ')}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Only drop extensions in local environments
  if (!IS_LOCAL) {
    console.log('Skipping extension removal in non-local environment');
    return;
  }

  const names = [...CANDIDATE_EXTENSIONS].reverse();
  for (const ext of names) {
    await knex.raw(`DROP EXTENSION IF EXISTS "${ext}"`);
  }
}
