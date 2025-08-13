import type { Knex } from "knex";
import fs from "fs";
import { ENV, envFile } from "./src/config/env";

const isDocker = ENV.DOCKER_MODE === "true" || fs.existsSync("/.dockerenv");

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */

const baseConnection = {
  database: ENV.DB_NAME,
  user: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  host: isDocker ? ENV.DB_HOST || "db" : ENV.DB_HOST || "localhost",
  port: Number(ENV.DB_PORT) || 5432,
};

// console.log("[DEBUG] Loaded DB Config:", {
//   file: envFile,
//   isDocker,
//   host: baseConnection.host,
//   port: baseConnection.port,
//   database: baseConnection.database,
//   user: baseConnection.user,
// });

const config: { [key: string]: Knex.Config } = {
  local: {
    client: "postgresql",
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations_dev",
      directory: "./migrations",
    },
  },
  docker: {
    client: "postgresql",
    connection: baseConnection,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations_dev",
      directory: "./migrations",
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
      tableName: "knex_migrations_staging",
      directory: "./migrations",
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
      directory: "./migrations",
    },
  },
  test: {
    client: "sqlite3",
    connection: {
      filename: ":memory:",
    },
    useNullAsDefault: true,
    migrations: {
      directory: "./migrations",
    },
    seeds: {
      directory: "./seeds",
    },
  },
};

export default config;
