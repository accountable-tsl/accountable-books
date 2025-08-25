module.exports = {
  staging: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 1, max: 10 },
    migrations: {
      tableName: 'knex_migrations_staging',
      directory: './apps/api/dist/migrations',
    },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 1, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './apps/api/dist/migrations',
    },
  },
};
