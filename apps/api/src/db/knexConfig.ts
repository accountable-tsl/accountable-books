import type { Knex } from 'knex';
import { ENV } from '../config/env.js';

export const runtimeKnexConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    database: ENV.POSTGRES_DB,
    user: ENV.POSTGRES_USER,
    password: ENV.POSTGRES_PASSWORD,
    host: ENV.DB_HOST || 'localhost',
    port: Number(ENV.DB_PORT) || 5432,
  },
  pool: {
    min: 2,
    max: 10,
    // Close idle connections after 30 seconds
    idleTimeoutMillis: 30000,
    // Close connections after 60 seconds of use
    acquireTimeoutMillis: 60000,
  },
  // Ensure transactions are properly handled
  asyncStackTraces: true,
};
