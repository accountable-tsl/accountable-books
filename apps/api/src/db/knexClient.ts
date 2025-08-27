import knex from 'knex';
import type { Knex } from 'knex';
import { NODE_ENV } from '../config/env.js';
import { runtimeKnexConfig } from '../../knexfile.js';

export const knexClient: Knex = knex(runtimeKnexConfig);

knexClient
  .raw('SELECT 1')
  .then(() => console.log(`Knex connected to DB in ${NODE_ENV} mode`))
  .catch((err) => console.error(`Knex connection failed: ${err.message}`));
