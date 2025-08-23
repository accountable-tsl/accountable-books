#!/usr/bin/env node

import { knexClient as knex } from '../dist/db/knexClient.js';
import { logger } from '../dist/shared/utils/logger.js';

async function runStagingMigrations() {
  try {
    logger.info('Starting database migrations for staging environment...');

    // Set environment to staging for proper knex config
    process.env.NODE_ENV = 'staging';

    // Run migrations for staging environment
    const [batchNo, migrationFiles] = await knex.migrate.latest({
      directory: './migrations',
      tableName: 'knex_migrations_staging',
    });

    if (migrationFiles.length === 0) {
      logger.info('Database is already up to date');
    } else {
      logger.info(`Batch ${batchNo} run: ${migrationFiles.length} migrations`);
      migrationFiles.forEach((file) => {
        logger.info(`- ${file}`);
      });
    }

    logger.info('Staging migrations completed successfully');
  } catch (error) {
    logger.error('Staging migration failed:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStagingMigrations();
}

export { runStagingMigrations };
