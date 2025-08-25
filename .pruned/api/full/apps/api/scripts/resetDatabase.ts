import { ENV } from '../src/config/env';
import pg from 'pg';

const client = new pg.Client({
  host: ENV.DB_HOST || 'localhost',
  port: Number(ENV.DB_PORT) || 5432,
  user: ENV.POSTGRES_USER,
  password: ENV.POSTGRES_PASSWORD,
  database: ENV.POSTGRES_DB,
});

const run = async () => {
  console.log('⚠️ Resetting database:', ENV.POSTGRES_DB);

  await client.connect();

  // Drops all public schema tables, views, etc.
  await client.query(`
DO $$ DECLARE
  r RECORD;
BEGIN

  -- Drop all views (excluding extension-owned views)
  FOR r IN (
    SELECT table_name FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name NOT IN ('pg_stat_statements_info', 'pg_stat_statements')
  ) LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;

  -- Drop all materialized views
  FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS public.' || quote_ident(r.matviewname) || ' CASCADE';
  END LOOP;

  -- Drop all tables
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;

  -- Drop all sequences
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
  END LOOP;

  -- Drop all types (including enums)
  FOR r IN (SELECT t.typname FROM pg_type t
            LEFT JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;
  `);

  await client.end();

  console.log('✅ Database reset complete.');
};

run().catch((err) => {
  console.error('❌ Error resetting database:', err);
  process.exit(1);
});
