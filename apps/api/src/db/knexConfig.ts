import type { Knex } from 'knex';
import { ENV } from '../config/env.js';

export const runtimeKnexConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    database: ENV.DB_NAME,
    user: ENV.DB_USER,
    password: ENV.DB_PASSWORD,
    host: ENV.DB_HOST || 'localhost',
    port: Number(ENV.DB_PORT) || 5432,
  },
  pool: {
    min: 2,
    max: 10,
  },
};
