import type { Knex } from 'knex';
import knex from 'knex';

import config from '../../../knexfile.js';
import { SEED_STEPS } from './registry.js';

import type { DemoFilter } from '../shared/config.js';
import type { SeedStep } from './registry.js';

export interface RunnerOptions {
  steps?: string[]; // Only run specific steps
  exclude?: string[]; // Exclude specific steps from execution
  parallel?: boolean; // Run steps in parallel (dangerous for dependencies)
  dryRun?: boolean; // Log what would happen without executing
}

/**
 * Main runner for demo seeding operations
 */
export class DemoSeedRunner {
  constructor(private knex: Knex) {}

  /**
   * Check if database schema exists by checking for a key table
   */
  private async checkSchemaExists(): Promise<boolean> {
    try {
      // Check if users table exists (first table created in migrations)
      await this.knex.raw('SELECT 1 FROM users LIMIT 1');
      return true;
    } catch (error) {
      // Check if it's a "relation does not exist" error
      if (
        error instanceof Error &&
        (error.message.includes('does not exist') ||
          error.message.includes('relation') ||
          (error as any).code === '42P01')
      ) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Check if we can automatically run migrations (only in local/test environments)
   */
  private canAutoMigrate(): boolean {
    const env = process.env.NODE_ENV ?? 'local';
    return env === 'local' || env === 'test';
  }

  /**
   * Automatically run migrations if schema doesn't exist
   */
  private async ensureMigrationsRun(): Promise<void> {
    const schemaExists = await this.checkSchemaExists();

    if (schemaExists) {
      return; // Schema exists, we're good
    }

    // Schema doesn't exist - check if we can auto-migrate
    if (!this.canAutoMigrate()) {
      throw new Error(
        `Database schema not found. Please run migrations first:\n` +
          `  pnpm -F @accountable-books/api run migrate\n` +
          `  or: make db-migrate\n` +
          `\n` +
          `Note: Auto-migration is only available in local/test environments for safety.`,
      );
    }

    // Auto-run migrations in local/test environments
    console.log(
      '⚠️  Database schema not found. Running migrations automatically...',
    );

    const env = process.env.NODE_ENV ?? 'local';
    const migrationTableName =
      env === 'test'
        ? 'knex_migrations_test'
        : env === 'local'
          ? 'knex_migrations_dev'
          : null;

    if (!migrationTableName) {
      throw new Error('Cannot determine migration table name for environment');
    }

    try {
      // Create a new knex instance with migration config
      const migrationConfig = config[env];
      if (!migrationConfig) {
        throw new Error(`No migration config found for environment: ${env}`);
      }

      const migrationKnex = knex(migrationConfig);

      try {
        const [, pendingMigrations] = await migrationKnex.migrate.list();
        if (pendingMigrations.length > 0) {
          console.log(
            `   Running ${pendingMigrations.length} pending migration(s)...`,
          );
          const [batchNo, migrationFiles] =
            await migrationKnex.migrate.latest();
          console.log(
            `   ✓ Migrations completed (batch ${batchNo}, ${migrationFiles.length} files)`,
          );
        } else {
          console.log('   ✓ Database already up to date');
        }
      } finally {
        await migrationKnex.destroy();
      }

      // Verify schema now exists
      const schemaNowExists = await this.checkSchemaExists();
      if (!schemaNowExists) {
        throw new Error(
          'Migrations completed but schema still not found. Please check migration logs.',
        );
      }

      console.log('   ✓ Database schema ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(
        `Failed to run migrations automatically: ${message}\n` +
          `Please run migrations manually: pnpm -F @accountable-books/api run migrate`,
      );
    }
  }

  /**
   * Apply demo seeds (create operations)
   */
  async apply(
    filters?: DemoFilter,
    options: RunnerOptions = {},
  ): Promise<void> {
    const steps = this.getSteps(options.steps, options.exclude);
    const { parallel = false, dryRun = false } = options;

    console.log(`🌱 Applying demo seeds...`);
    console.log(`   Steps: ${steps.map((s) => s.name).join(', ')}`);
    console.log(`   Filters:`, filters || 'none');
    console.log(
      `   Mode: ${parallel ? 'parallel' : 'sequential'}${dryRun ? ' (dry run)' : ''}`,
    );

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Ensure migrations have been run before seeding
    await this.ensureMigrationsRun();

    await this.knex.transaction(
      async (trx) => {
        // Set statement timeout for the entire transaction (5 minutes)
        // This prevents transactions from hanging indefinitely if interrupted
        await trx.raw("SET LOCAL statement_timeout = '300s'");

        if (parallel) {
          await this.runParallel(steps, 'create', trx, filters);
        } else {
          await this.runSequential(steps, 'create', trx, filters);
        }
      },
      {
        // Knex-level timeout (5 minutes)
        // This is a backup timeout in case the PostgreSQL timeout doesn't fire
        isolationLevel: 'read committed',
      },
    );

    console.log('✅ Demo seeds applied successfully');
  }

  /**
   * Reverse demo seeds (delete operations)
   */
  async reverse(
    filters?: DemoFilter,
    options: RunnerOptions = {},
  ): Promise<void> {
    const steps = this.getSteps(options.steps, options.exclude);
    const reversedSteps = [...steps].reverse(); // Delete in reverse order
    const { dryRun = false } = options;

    console.log(`🧹 Reversing demo seeds...`);
    console.log(`   Steps: ${reversedSteps.map((s) => s.name).join(', ')}`);
    console.log(`   Filters:`, filters || 'none');
    console.log(`   Mode: sequential${dryRun ? ' (dry run)' : ''}`);

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Check if schema exists (but don't auto-migrate for reverse operations)
    const schemaExists = await this.checkSchemaExists();
    if (!schemaExists) {
      throw new Error(
        `Database schema not found. Cannot reverse demo seeds.\n` +
          `Please run migrations first: pnpm -F @accountable-books/api run migrate`,
      );
    }

    await this.knex.transaction(
      async (trx) => {
        // Set statement timeout for delete operations (3 minutes)
        await trx.raw("SET LOCAL statement_timeout = '180s'");

        // Always run deletions sequentially to respect dependencies
        await this.runSequential(reversedSteps, 'delete', trx, filters);
      },
      {
        isolationLevel: 'read committed',
      },
    );

    console.log('✅ Demo seeds reversed successfully');
  }

  /**
   * Reset: reverse then apply
   */
  async reset(
    filters?: DemoFilter,
    options: RunnerOptions = {},
  ): Promise<void> {
    console.log('🔄 Resetting demo seeds...');
    await this.reverse(filters, options);
    await this.apply(filters, options);
    console.log('✅ Demo seeds reset successfully');
  }

  /**
   * Show status of current demo data
   */
  async status(): Promise<void> {
    console.log('📊 Demo Seed Status:');

    for (const step of SEED_STEPS) {
      let count = 0;
      try {
        switch (step.name) {
          case 'user':
            count = await this.knex('users')
              .where('user_type', 'demo')
              .count('* as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'companies':
            count = await this.knex('companies')
              .where('is_demo_company', true)
              .count('* as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'chart-of-accounts':
            count = await this.knex('coa')
              .join('companies', 'coa.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('coa.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'contacts':
            count = await this.knex('contacts')
              .join('companies', 'contacts.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('contacts.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'projects':
            count = await this.knex('projects')
              .join('companies', 'projects.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('projects.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'bank-accounts':
            count = await this.knex('bank_accounts')
              .join('companies', 'bank_accounts.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('bank_accounts.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'bank-transactions':
            count = await this.knex('bank_transactions')
              .join(
                'bank_accounts',
                'bank_transactions.bank_account_id',
                'bank_accounts.id',
              )
              .join('companies', 'bank_accounts.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('bank_transactions.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          case 'journals':
            count = await this.knex('journal_batches')
              .join('companies', 'journal_batches.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('journal_batches.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          default:
            count = 0;
        }
        console.log(
          `   ${step.name.padEnd(12)} ${count.toString().padStart(4)} records`,
        );
      } catch (error) {
        console.log(
          `   ${step.name.padEnd(12)}    ? records (error: ${error instanceof Error ? error.message : 'unknown'})`,
        );
      }
    }
  }

  private getSteps(stepNames?: string[], excludeNames?: string[]): SeedStep[] {
    let steps = SEED_STEPS;

    // If specific steps are requested, filter to those
    if (stepNames?.length) {
      const requestedSteps = stepNames.map((name) => {
        const step = SEED_STEPS.find((s) => s.name === name);
        if (!step) {
          throw new Error(
            `Unknown step: ${name}. Available steps: ${SEED_STEPS.map((s) => s.name).join(', ')}`,
          );
        }
        return step;
      });

      // Sort by order to maintain dependencies
      steps = requestedSteps.sort((a, b) => a.order - b.order);
    }

    // Filter out excluded steps
    if (excludeNames?.length) {
      const excludeSet = new Set(excludeNames);
      steps = steps.filter((step) => {
        if (excludeSet.has(step.name)) {
          return false;
        }
        return true;
      });

      // Validate excluded step names
      for (const excludeName of excludeNames) {
        if (!SEED_STEPS.some((s) => s.name === excludeName)) {
          throw new Error(
            `Unknown step to exclude: ${excludeName}. Available steps: ${SEED_STEPS.map((s) => s.name).join(', ')}`,
          );
        }
      }
    }

    return steps;
  }

  private async runSequential(
    steps: SeedStep[],
    operation: 'create' | 'delete',
    trx: Knex.Transaction,
    filters?: DemoFilter,
  ): Promise<void> {
    for (const step of steps) {
      try {
        const fn = operation === 'create' ? step.createFn : step.deleteFn;

        if (!fn) {
          console.log(
            `   ⏭️  Skipping ${step.name} (no ${operation} function)`,
          );
          continue;
        }

        console.log(
          `   ⚡ ${operation === 'create' ? 'Creating' : 'Deleting'} ${step.name}...`,
        );
        await fn(trx, filters);
        console.log(
          `   ✓ ${step.name} ${operation === 'create' ? 'created' : 'deleted'}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        console.error(`   ❌ Failed to ${operation} ${step.name}: ${message}`);
        throw error;
      }
    }
  }

  private async runParallel(
    steps: SeedStep[],
    operation: 'create' | 'delete',
    trx: Knex.Transaction,
    filters?: DemoFilter,
  ): Promise<void> {
    console.warn(
      '⚠️  Running in parallel mode - dependencies may not be respected',
    );

    const promises = steps
      .filter((step) => {
        const fn = operation === 'create' ? step.createFn : step.deleteFn;
        if (!fn) {
          console.log(
            `   ⏭️  Skipping ${step.name} (no ${operation} function)`,
          );
          return false;
        }
        return true;
      })
      .map(async (step) => {
        try {
          const fn = operation === 'create' ? step.createFn : step.deleteFn;
          console.log(
            `   ⚡ ${operation === 'create' ? 'Creating' : 'Deleting'} ${step.name}...`,
          );
          await fn!(trx, filters);
          console.log(
            `   ✓ ${step.name} ${operation === 'create' ? 'created' : 'deleted'}`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'unknown error';
          console.error(
            `   ❌ Failed to ${operation} ${step.name}: ${message}`,
          );
          throw error;
        }
      });

    await Promise.all(promises);
  }
}

/**
 * Create a runner instance
 */
export function createDemoSeedRunner(knex: Knex): DemoSeedRunner {
  return new DemoSeedRunner(knex);
}
