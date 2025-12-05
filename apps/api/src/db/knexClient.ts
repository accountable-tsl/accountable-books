import type { Knex } from 'knex';
import knex from 'knex';

import { runtimeKnexConfig } from '../../knexfile.js';
import { NODE_ENV } from '../config/env.js';

export const knexClient: Knex = knex(runtimeKnexConfig);

knexClient
  .raw('SELECT 1')
  .then(() => console.log(`Knex connected to DB in ${NODE_ENV} mode`))
  .catch((err) => console.error(`Knex connection failed: ${err.message}`));
