#!/usr/bin/env node

import { knexClient as knex } from '../src/db/knexClient.js';
import { logger } from '../src/shared/utils/logger.js';

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
      migrationFiles.forEach((file: string) => {
        logger.info(`- ${file}`);
      });
    }

    logger.info('Staging migrations completed successfully');
  } catch (error) {
    logger.error({ err: error as Error }, 'Staging migration failed');
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
