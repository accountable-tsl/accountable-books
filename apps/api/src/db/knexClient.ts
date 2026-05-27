import type { Knex } from 'knex';
import knex from 'knex';

import { runtimeKnexConfig } from '../../knexfile.js';

export const knexClient: Knex = knex(runtimeKnexConfig);
