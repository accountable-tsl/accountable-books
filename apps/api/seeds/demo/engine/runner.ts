import type { Knex } from 'knex';
import { DemoFilter } from '../shared/config.js';
import { SEED_STEPS, SeedStep } from './registry.js';

export interface RunnerOptions {
  steps?: string[]; // Only run specific steps
  parallel?: boolean; // Run steps in parallel (dangerous for dependencies)
  dryRun?: boolean; // Log what would happen without executing
}

/**
 * Main runner for demo seeding operations
 */
export class DemoSeedRunner {
  constructor(private knex: Knex) {}

  /**
   * Apply demo seeds (create operations)
   */
  async apply(filters?: DemoFilter, options: RunnerOptions = {}): Promise<void> {
    const steps = this.getSteps(options.steps);
    const { parallel = false, dryRun = false } = options;

    console.log(`🌱 Applying demo seeds...`);
    console.log(`   Steps: ${steps.map((s) => s.name).join(', ')}`);
    console.log(`   Filters:`, filters || 'none');
    console.log(`   Mode: ${parallel ? 'parallel' : 'sequential'}${dryRun ? ' (dry run)' : ''}`);

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    await this.knex.transaction(async (trx) => {
      if (parallel) {
        await this.runParallel(steps, 'create', trx, filters);
      } else {
        await this.runSequential(steps, 'create', trx, filters);
      }
    });

    console.log('✅ Demo seeds applied successfully');
  }

  /**
   * Reverse demo seeds (delete operations)
   */
  async reverse(filters?: DemoFilter, options: RunnerOptions = {}): Promise<void> {
    const steps = this.getSteps(options.steps);
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

    await this.knex.transaction(async (trx) => {
      // Always run deletions sequentially to respect dependencies
      await this.runSequential(reversedSteps, 'delete', trx, filters);
    });

    console.log('✅ Demo seeds reversed successfully');
  }

  /**
   * Reset: reverse then apply
   */
  async reset(filters?: DemoFilter, options: RunnerOptions = {}): Promise<void> {
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
          case 'users':
            count = await this.knex('users')
              .where('is_demo_user', true)
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
          case 'contacts':
            count = await this.knex('contacts')
              .join('companies', 'contacts.company_id', 'companies.id')
              .where('companies.is_demo_company', true)
              .count('contacts.id as count')
              .first()
              .then((r) => Number(r?.count) || 0);
            break;
          default:
            count = 0;
        }
        console.log(`   ${step.name.padEnd(12)} ${count.toString().padStart(4)} records`);
      } catch (error) {
        console.log(
          `   ${step.name.padEnd(12)}    ? records (error: ${error instanceof Error ? error.message : 'unknown'})`,
        );
      }
    }
  }

  private getSteps(stepNames?: string[]): SeedStep[] {
    if (!stepNames?.length) {
      return SEED_STEPS;
    }

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
    return requestedSteps.sort((a, b) => a.order - b.order);
  }

  private async runSequential(
    steps: SeedStep[],
    operation: 'create' | 'delete',
    trx: Knex.Transaction,
    filters?: DemoFilter,
  ): Promise<void> {
    for (const step of steps) {
      try {
        console.log(`   ⚡ ${operation === 'create' ? 'Creating' : 'Deleting'} ${step.name}...`);
        if (operation === 'create') {
          await step.createFn(trx, filters);
        } else {
          await step.deleteFn(trx, filters);
        }
        console.log(`   ✓ ${step.name} ${operation === 'create' ? 'created' : 'deleted'}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
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
    console.warn('⚠️  Running in parallel mode - dependencies may not be respected');

    const promises = steps.map(async (step) => {
      try {
        console.log(`   ⚡ ${operation === 'create' ? 'Creating' : 'Deleting'} ${step.name}...`);
        if (operation === 'create') {
          await step.createFn(trx, filters);
        } else {
          await step.deleteFn(trx, filters);
        }
        console.log(`   ✓ ${step.name} ${operation === 'create' ? 'created' : 'deleted'}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error(`   ❌ Failed to ${operation} ${step.name}: ${message}`);
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
