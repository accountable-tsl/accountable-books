import type { Knex } from 'knex';
import { runtimeKnexConfig } from './src/db/knexConfig.js';

const config: Record<string, Knex.Config> = {
  local: {
    ...runtimeKnexConfig,
    migrations: {
      tableName: 'knex_migrations_dev',
      directory: './migrations',
    },
  },

  staging: {
    ...runtimeKnexConfig,
    migrations: {
      tableName: 'knex_migrations_staging',
      directory: './migrations',
    },
  },

  production: {
    ...runtimeKnexConfig,
    migrations: { directory: './migrations', tableName: 'knex_migrations' },
  },

  test: {
    ...runtimeKnexConfig,
    migrations: {
      tableName: 'knex_migrations_test',
      directory: './migrations',
    },
  },
};

export default config;
