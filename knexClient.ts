import config from "./knexfile";
import knexModule from "knex";
import type { Knex } from "knex";
import { NODE_ENV } from "./src/config/env";

const knexConfig = config[NODE_ENV];

if (!knexConfig?.client) {
  throw new Error(`Invalid or missing knex config for NODE_ENV="${NODE_ENV}"`);
}

const knex: Knex = knexModule(knexConfig);

knex
  .raw("SELECT 1")
  .then(() => console.log(`Knex connected to DB in ${NODE_ENV} mode`))
  .catch((err) => console.error(`Knex connection failed: ${err.message}`));

export default knex;
