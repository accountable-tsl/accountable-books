import './config/env-loader.js';

import type { Knex } from 'knex';

import { resolveTestDatabaseName } from './config/test-worker-sandbox.js';

// Environment detection
const ENV = process.env.NODE_ENV ?? 'local';
const IS_PROD = ENV === 'production';

const IS_LOCAL_STAGING =
  process.argv.includes('--local:staging') ||
  process.env.LOCAL_STAGING === 'true';

// Database URLs
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_MIGRATION_URL = process.env.DATABASE_MIGRATION_URL;

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

const getLocalConnection = ({ isTest = false }: { isTest?: boolean } = {}) => {
  const database =
    isTest && ENV === 'test'
      ? resolveTestDatabaseName(DB_CONFIG.name)
      : isTest
        ? `${DB_CONFIG.name}_test`
        : DB_CONFIG.name;

  return {
    ...DB_CONFIG,
    database,
  };
};

const getRemoteConnection = (url: string | undefined) => {
  if (!url) return undefined;
  return {
    connectionString: url,
    ssl: isNeonHost(url) ? { rejectUnauthorized: false } : undefined,
  };
};

const getRuntimeConnection = (): Knex.Config['connection'] => {
  if (ENV === 'local' || IS_LOCAL_STAGING) return getLocalConnection();
  if (ENV === 'test') return getLocalConnection({ isTest: true });
  return DATABASE_URL ?? DATABASE_MIGRATION_URL;
};

// Base configuration shared across all environments
const baseConfig: Knex.Config = {
  client: 'pg',
  pool: {
    min: 2,
    max: 10,
  },
  asyncStackTraces: !IS_PROD,
};

const testPoolConfig: Knex.PoolConfig = {
  min: 0,
  max: 4,
};

// Runtime configuration
export const runtimeKnexConfig: Knex.Config = {
  ...baseConfig,
  connection: getRuntimeConnection(),
  pool: ENV === 'test' ? testPoolConfig : baseConfig.pool,
};

// Migration configuration factory
const cfg = (
  tableName: string,
  connection: Knex.Config['connection'],
  pool: Knex.PoolConfig = baseConfig.pool!,
): Knex.Config => ({
  ...baseConfig,
  connection,
  pool,
  migrations: {
    tableName,
    directory: './migrations',
    disableTransactions: false,
  },
});

// Environment-specific configurations
const config: Record<string, Knex.Config> = {
  local: cfg('knex_migrations_dev', getLocalConnection()),
  test: cfg(
    'knex_migrations_test',
    getLocalConnection({ isTest: true }),
    testPoolConfig,
  ),
  staging: cfg(
    'knex_migrations_staging',
    IS_LOCAL_STAGING
      ? getLocalConnection()
      : getRemoteConnection(DATABASE_MIGRATION_URL),
  ),
  production: cfg(
    'knex_migrations',
    getRemoteConnection(DATABASE_MIGRATION_URL ?? DATABASE_URL),
  ),
};

export default config;
