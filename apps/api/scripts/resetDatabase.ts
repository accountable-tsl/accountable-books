import pg from 'pg';

import { ENV } from '../config/env-loader.js';
import { isProd, NODE_ENV } from '../src/config/env.js';
import { redis } from '../src/lib/redis.js';

const CLEANUP_SQL = `
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'app'
    AND table_name NOT IN ('pg_stat_statements_info', 'pg_stat_statements')
  ) LOOP
    EXECUTE 'DROP VIEW IF EXISTS app.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;

  FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'app') LOOP
    EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS app.' || quote_ident(r.matviewname) || ' CASCADE';
  END LOOP;

  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'app') LOOP
    EXECUTE 'DROP TABLE IF EXISTS app.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;

  FOR r IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
    )
  ) LOOP
    EXECUTE 'DROP ' || r.kind || ' IF EXISTS app.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
  END LOOP;

  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'app') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS app.' || quote_ident(r.sequence_name) || ' CASCADE';
  END LOOP;

  FOR r IN (SELECT t.typname FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'app' AND t.typtype IN ('e', 'd')
            AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = t.oid AND d.deptype = 'e'
            )) LOOP
    EXECUTE 'DROP TYPE IF EXISTS app.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;

  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'knex_%') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
`;

async function resetDatabase(dbName: string): Promise<void> {
  const client = new pg.Client({
    host: ENV.DB_HOST || 'localhost',
    port: Number(ENV.DB_PORT) || 5432,
    user: ENV.POSTGRES_USER,
    password: ENV.POSTGRES_PASSWORD,
    database: dbName,
  });

  console.log(`⚠️ Resetting database: ${dbName}`);
  await client.connect();

  try {
    await client.query(CLEANUP_SQL);
    console.log(`✅ Database reset complete: ${dbName}`);
  } finally {
    await client.end();
  }
}

const run = async () => {
  const testDbName = `${ENV.POSTGRES_DB}_test`;

  if (NODE_ENV === 'test') {
    await resetDatabase(testDbName);
  } else {
    await resetDatabase(ENV.POSTGRES_DB!);
    await resetDatabase(testDbName);
  }

  // Optionally flush Redis as part of full reset
  const skipRedis = process.argv.includes('--no-redis');
  const forceRedis = process.argv.includes('--force-redis');

  if (skipRedis) {
    console.log('⚠️ Skipping Redis flush (flag: --no-redis).');
    return;
  }

  if (isProd && !forceRedis) {
    console.log(
      '🚫 Refusing to flush Redis in production without --force-redis',
    );
    return;
  }

  try {
    console.log('🧹 Flushing Redis...');
    await redis.flushdb();
    console.log('✅ Redis flush complete.');
  } catch (err) {
    console.error('❌ Error flushing Redis:', err);
    throw err;
  } finally {
    try {
      await redis.quit();
    } catch {
      // Ignore redis quit errors
      console.log('');
    }
  }
};

run().catch((err) => {
  console.error('❌ Error resetting database:', err);
  process.exit(1);
});
