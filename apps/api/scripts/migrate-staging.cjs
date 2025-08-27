#!/usr/bin/env node

const knex = require('knex');
const knexConfig = require('../knexfile.cjs');

async function runStagingMigrations() {
  const db = knex(knexConfig.staging);

  try {
    console.log('Starting database migrations for staging environment...');

    // Run migrations for staging environment
    const [batchNo, migrationFiles] = await db.migrate.latest({
      directory: './migrations',
      tableName: 'knex_migrations_staging',
    });

    if (migrationFiles.length === 0) {
      console.log('Database is already up to date');
    } else {
      console.log(`Batch ${batchNo} run: ${migrationFiles.length} migrations`);
      migrationFiles.forEach((file) => {
        console.log(`- ${file}`);
      });
    }

    console.log('Staging migrations completed successfully');
  } catch (error) {
    console.error('Staging migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runStagingMigrations();
}

module.exports = { runStagingMigrations };
