import './config/env-loader.ts';
import type { Knex } from 'knex';

// Environment detection
const ENV = process.env.NODE_ENV ?? 'local';
const IS_LOCAL_STAGING =
  process.argv.includes('--local:staging') ||
  process.env.LOCAL_STAGING === 'true';

// Database URLs
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_NOPOOL ?? '';

// Database configuration
const DB_CONFIG = {
  name: process.env.POSTGRES_DB ?? 'accountable_books',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
} as const;

const isNeonHost = (url?: string): boolean =>
  Boolean(url?.includes('.neon.tech'));
const getLocalConnection = (isTest: boolean = false) => ({
  ...DB_CONFIG,
  database: isTest ? `${DB_CONFIG.name}_test` : DB_CONFIG.name,
});

const getRemoteConnection = (url: string) => {
  if (!url) return undefined;

  return {
    connectionString: url,
    ssl: isNeonHost(url) ? { rejectUnauthorized: false } : undefined,
  };
};

const getConnection = (): Knex.Config['connection'] => {
  const isLocal = ENV === 'local' || IS_LOCAL_STAGING;
  const isTest = ENV === 'test';

  if (isLocal) return getLocalConnection();
  if (isTest) return getLocalConnection(true);

  return DATABASE_URL || DATABASE_URL_UNPOOLED;
};

// Base configuration shared across all environments
const baseConfig: Knex.Config = {
  client: 'pg',
  pool: { min: 2, max: 10 },
  asyncStackTraces: true,
};

// Runtime configuration
export const runtimeKnexConfig: Knex.Config = {
  ...baseConfig,
  connection: getConnection(),
};

// Migration configuration factory
const cfg = (
  tableName: string,
  connection: Knex.Config['connection'],
): Knex.Config => ({
  ...baseConfig,
  connection,
  migrations: {
    tableName,
    directory: './migrations',
    disableTransactions: false,
  },
});

// Environment-specific configurations
const config: Record<string, Knex.Config> = {
  local: cfg('knex_migrations_dev', getLocalConnection()),
  test: cfg('knex_migrations_test', getLocalConnection(true)),
  staging: cfg(
    'knex_migrations_staging',
    IS_LOCAL_STAGING
      ? getLocalConnection()
      : getRemoteConnection(DATABASE_URL_UNPOOLED),
  ),
  production: cfg(
    'knex_migrations',
    getRemoteConnection(DATABASE_URL_UNPOOLED ?? DATABASE_URL),
  ),
};

export default config;
