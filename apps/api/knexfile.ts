import './config/env-loader.js';
import type { Knex } from 'knex';

const ENV = process.env.NODE_ENV ?? 'local';
const IS_LOCAL_STAGING =
  process.argv.includes('--local:staging') || process.env.LOCAL_STAGING === 'true';
const USE_LOCAL = ENV === 'local' || ENV === 'test' || IS_LOCAL_STAGING;

const isNeonHost = (u?: string) => Boolean(u && u.includes('.neon.tech'));
const DIRECT_URL = process.env.DATABASE_URL ?? '';
const UNPOOLED_URL = process.env.DATABASE_URL_NOPOOL ?? '';

const localConnection = {
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
};

const base: Knex.Config = {
  client: 'pg',
  pool: { min: 2, max: 10 },
  asyncStackTraces: true,
};

export const runtimeKnexConfig: Knex.Config = {
  ...base,
  connection: USE_LOCAL ? localConnection : UNPOOLED_URL || DIRECT_URL,
};

const remoteConn = (url: string) =>
  url
    ? {
        connectionString: url,
        ssl: isNeonHost(url) ? { rejectUnauthorized: false } : undefined,
      }
    : undefined;

function cfg(migrationsTable: string): Knex.Config {
  const config = {
    ...base,
    connection: USE_LOCAL ? localConnection : remoteConn(DIRECT_URL),
    migrations: {
      tableName: migrationsTable,
      directory: './migrations',
      disableTransactions: false,
    },
  };
  return config;
}

const config: Record<string, Knex.Config> = {
  local: cfg('knex_migrations_dev'),
  test: cfg('knex_migrations_dev'),
  staging: cfg('knex_migrations_staging'),
  production: cfg('knex_migrations'),
};

export default config;
