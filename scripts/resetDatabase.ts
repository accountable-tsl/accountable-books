import { ENV } from "../src/config/env";
import pg from "pg";

const client = new pg.Client({
  host: ENV.DB_HOST || "localhost",
  port: Number(ENV.DB_PORT) || 5432,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  database: ENV.DB_NAME,
});

const run = async () => {
  console.log("⚠️ Resetting database:", ENV.DB_NAME);

  await client.connect();

  // Drops all public schema tables, views, etc.
  await client.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      -- drop all constraints
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  await client.end();

  console.log("✅ Database reset complete.");
};

run().catch((err) => {
  console.error("❌ Error resetting database:", err);
  process.exit(1);
});
