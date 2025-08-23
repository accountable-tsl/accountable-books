#!/usr/bin/env node

import { knexClient as knex } from '../src/db/knexClient.js';
import { logger } from '../src/shared/utils/logger.js';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Run migrations for staging environment
    const [batchNo, migrationFiles] = await knex.migrate.latest({
      directory: './migrations',
    });

    if (migrationFiles.length === 0) {
      logger.info('Database is already up to date');
    } else {
      logger.info(`Batch ${batchNo} run: ${migrationFiles.length} migrations`);
      migrationFiles.forEach((file) => {
        logger.info(`- ${file}`);
      });
    }

    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export { runMigrations };
