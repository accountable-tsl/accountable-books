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

  test: {
    ...runtimeKnexConfig,
    migrations: {
      tableName: 'knex_migrations_test',
      directory: './migrations',
    },
  },
};

export default config;
