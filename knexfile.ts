import dotenv from "dotenv";
import type { Knex } from "knex";
import fs from "fs";
import path from "path";

// Determine the base path
const envBase = path.resolve(process.cwd());

// Determine what to load
const envFile = fs.existsSync(path.join(envBase, ".env.docker"))
  ? ".env.docker"
  : fs.existsSync(path.join(envBase, `.env.${process.env.NODE_ENV}`))
    ? `.env.${process.env.NODE_ENV}`
    : ".env";

// Load it
dotenv.config({ path: envFile });

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */

const baseConnection = {
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "postgresql",
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },

  staging: {
    client: "postgresql",
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },

  production: {
    client: "postgresql",
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },
};

export default config;
