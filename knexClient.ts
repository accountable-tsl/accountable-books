import config from "./knexfile";
import knexModule from "knex";
import type { Knex } from "knex";

const env = process.env.NODE_ENV || "development";
const knexConfig = config[env];

if (!knexConfig?.client) {
  throw new Error(`❌ Invalid or missing knex config for NODE_ENV="${env}"`);
}

const knex: Knex = knexModule(knexConfig);
export default knex;
