import type { Knex } from 'knex';
import crypto from 'crypto';
import type {
  EnhancedSeedDefinition,
  SeedContext,
  MarkFunction,
  SeedExecutionResult,
  ProgressCallback,
} from './types.js';

export class EnhancedSeedRunner {
  private knex: Knex;
  private progressCallback?: ProgressCallback;

  constructor(knex: Knex, progressCallback?: ProgressCallback) {
    this.knex = knex;
    this.progressCallback = progressCallback;
  }

  async executeSeeds(
    seeds: EnhancedSeedDefinition[],
    context: SeedContext,
    parallel: boolean = false,
  ): Promise<SeedExecutionResult[]> {
    // Sort seeds by dependencies
    const sortedSeeds = this.sortSeedsByDependencies(seeds);

    if (parallel) {
      return this.executeParallel(sortedSeeds, context);
    } else {
      return this.executeSequential(sortedSeeds, context);
    }
  }

  async executeSeed(
    seed: EnhancedSeedDefinition,
    context: SeedContext,
  ): Promise<SeedExecutionResult> {
    const startTime = Date.now();
    let artifactsCreated = 0;

    try {
      this.reportProgress(`Starting seed: ${seed.name}`, 0, 1);

      const checksum = this.generateChecksum(seed, context);

      // Check if seed already executed with same checksum (idempotency)
      const existingRun = await this.knex('seed_runs')
        .where({
          name: seed.name,
          version: seed.version,
          checksum,
        })
        .andWhere('params', '=', this.knex.raw('?::jsonb', [JSON.stringify(context)]))
        .first();

      if (existingRun) {
        this.reportProgress(`Seed ${seed.name} already applied (idempotent)`, 1, 1);
        return {
          success: true,
          seedName: seed.name,
          duration: Date.now() - startTime,
          artifactsCreated: 0,
          message: 'Already applied (idempotent)',
        };
      }

      // Execute seed within transaction
      await this.knex.transaction(async (trx) => {
        // Defer constraints for complex operations
        await trx.raw('SET CONSTRAINTS ALL DEFERRED');

        // Record the seed run
        const [seedRun] = await trx('seed_runs')
          .insert({
            name: seed.name,
            version: seed.version,
            tags: seed.tags,
            params: JSON.stringify(context),
            checksum,
            description: seed.description,
          })
          .returning('*');

        // Create mark function for tracking artifacts
        const mark: MarkFunction = async (table, pk, operation = 'upsert', row) => {
          await trx('seed_artifacts').insert({
            run_id: seedRun.id,
            table_name: table,
            pk: JSON.stringify(pk),
            company_id: pk.company_id ?? context.companyId ?? null,
            operation: operation,
            checksum: row ? this.sha256(row) : null,
          });
          artifactsCreated++;
        };

        // Execute the seed logic
        await seed.up(trx, context);

        // If the seed didn't use mark function, we can't track artifacts
        // This is acceptable for some seeds
      });

      const duration = Date.now() - startTime;
      this.reportProgress(`Completed seed: ${seed.name}`, 1, 1);

      return {
        success: true,
        seedName: seed.name,
        duration,
        artifactsCreated,
        message: `Successfully applied ${seed.name} v${seed.version}`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.reportProgress(`Failed seed: ${seed.name}`, 0, 1, (error as Error).message);

      return {
        success: false,
        seedName: seed.name,
        duration,
        artifactsCreated,
        error: error as Error,
      };
    }
  }

  async removeSeed(
    seed: EnhancedSeedDefinition,
    context: SeedContext,
  ): Promise<SeedExecutionResult> {
    const startTime = Date.now();

    try {
      this.reportProgress(`Removing seed: ${seed.name}`, 0, 1);

      await this.knex.transaction(async (trx) => {
        await trx.raw('SET CONSTRAINTS ALL DEFERRED');

        // Execute the down migration
        await seed.down(trx, context);

        // Remove seed artifacts
        const seedRuns = await trx('seed_runs').where('name', seed.name).select('id');

        if (seedRuns.length > 0) {
          const runIds = seedRuns.map((run) => run.id);

          // Delete artifacts first
          await trx('seed_artifacts').whereIn('run_id', runIds).delete();

          // Delete seed runs
          await trx('seed_runs').whereIn('id', runIds).delete();
        }
      });

      const duration = Date.now() - startTime;
      this.reportProgress(`Removed seed: ${seed.name}`, 1, 1);

      return {
        success: true,
        seedName: seed.name,
        duration,
        artifactsCreated: 0,
        message: `Successfully removed ${seed.name}`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.reportProgress(`Failed to remove seed: ${seed.name}`, 0, 1, (error as Error).message);

      return {
        success: false,
        seedName: seed.name,
        duration,
        artifactsCreated: 0,
        error: error as Error,
      };
    }
  }

  // Execute seeds sequentially (respecting dependencies)
  private async executeSequential(
    seeds: EnhancedSeedDefinition[],
    context: SeedContext,
  ): Promise<SeedExecutionResult[]> {
    const results: SeedExecutionResult[] = [];

    for (const seed of seeds) {
      const result = await this.executeSeed(seed, context);
      results.push(result);

      // Stop on first failure
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  // Execute seeds in parallel (where dependencies allow)
  private async executeParallel(
    seeds: EnhancedSeedDefinition[],
    context: SeedContext,
  ): Promise<SeedExecutionResult[]> {
    const results: SeedExecutionResult[] = [];
    const executed = new Set<string>();
    const executing = new Map<string, Promise<SeedExecutionResult>>();

    const canExecute = (seed: EnhancedSeedDefinition): boolean => {
      return seed.dependencies.every((dep) => executed.has(dep));
    };

    while (executed.size < seeds.length) {
      // Find seeds that can be executed now
      const readySeeds = seeds.filter(
        (seed) => !executed.has(seed.name) && !executing.has(seed.name) && canExecute(seed),
      );

      if (readySeeds.length === 0) {
        // Wait for any executing seed to complete
        const executingPromises = Array.from(executing.values());
        if (executingPromises.length === 0) {
          throw new Error('Circular dependency detected or no seeds ready to execute');
        }
        await Promise.race(executingPromises);
        continue;
      }

      // Start executing ready seeds
      for (const seed of readySeeds) {
        const promise = this.executeSeed(seed, context).then((result) => {
          executed.add(seed.name);
          executing.delete(seed.name);
          results.push(result);
          return result;
        });
        executing.set(seed.name, promise);
      }
    }

    // Wait for all remaining executions to complete
    await Promise.all(executing.values());

    return results;
  }

  // Sort seeds by dependencies (topological sort)
  private sortSeedsByDependencies(seeds: EnhancedSeedDefinition[]): EnhancedSeedDefinition[] {
    const sorted: EnhancedSeedDefinition[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const seedMap = new Map(seeds.map((seed) => [seed.name, seed]));

    const visit = (seedName: string) => {
      if (visited.has(seedName)) return;
      if (visiting.has(seedName)) {
        throw new Error(`Circular dependency detected involving seed: ${seedName}`);
      }

      const seed = seedMap.get(seedName);
      if (!seed) {
        throw new Error(`Dependency not found: ${seedName}`);
      }

      visiting.add(seedName);

      // Visit dependencies first
      for (const dep of seed.dependencies) {
        visit(dep);
      }

      visiting.delete(seedName);
      visited.add(seedName);
      sorted.push(seed);
    };

    // Visit all seeds
    for (const seed of seeds) {
      if (!visited.has(seed.name)) {
        visit(seed.name);
      }
    }

    return sorted;
  }

  // Generate checksum for idempotency
  private generateChecksum(seed: EnhancedSeedDefinition, context: SeedContext): string {
    const data = {
      name: seed.name,
      version: seed.version,
      context: context,
    };
    return this.sha256(data);
  }

  // SHA256 hash utility
  private sha256(data: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  // Progress reporting
  private reportProgress(
    operation: string,
    current: number,
    total: number,
    message?: string,
  ): void {
    if (this.progressCallback) {
      this.progressCallback({
        operation,
        current,
        total,
        message,
      });
    }
  }
}

// Enhanced utility functions
export async function withSeedRun<T>(
  knex: Knex,
  seed: EnhancedSeedDefinition,
  context: SeedContext,
  runner: (trx: Knex.Transaction, mark: MarkFunction) => Promise<T>,
): Promise<T> {
  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify({ name: seed.name, version: seed.version, context }))
    .digest('hex');

  return knex.transaction(async (trx) => {
    // Defer constraints
    await trx.raw('SET CONSTRAINTS ALL DEFERRED');

    // Check idempotency
    const exists = await trx('seed_runs')
      .where({
        name: seed.name,
        version: seed.version,
        checksum,
      })
      .andWhere('params', '=', trx.raw('?::jsonb', [JSON.stringify(context)]))
      .first();

    if (exists) {
      console.log(`⏭️  Seed "${seed.name}" v${seed.version} already applied (idempotent)`);
      return {} as T; // Return empty result for idempotent operations
    }

    console.log(`🌱 Applying seed: ${seed.name} v${seed.version}`);

    // Record the seed run
    const [seedRun] = await trx('seed_runs')
      .insert({
        name: seed.name,
        version: seed.version,
        tags: seed.tags,
        params: JSON.stringify(context),
        checksum,
        description: seed.description || '',
      })
      .returning('*');

    // Create mark function
    const mark: MarkFunction = async (table, pk, operation = 'upsert', row) => {
      await trx('seed_artifacts').insert({
        run_id: seedRun.id,
        table_name: table,
        pk: JSON.stringify(pk),
        company_id: pk.company_id ?? context.companyId ?? null,
        operation: operation,
        checksum: row
          ? crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')
          : null,
      });
    };

    // Execute the runner
    return runner(trx, mark);
  });
}

// Cleanup utility for removing demo data
export async function cleanupDemoData(
  knex: Knex,
  filters: {
    company?: string;
    country?: string;
    companyType?: string;
    seedName?: string;
  } = {},
): Promise<{ tablesAffected: string[]; recordsDeleted: number }> {
  return knex.transaction(async (trx) => {
    await trx.raw('SET CONSTRAINTS ALL DEFERRED');

    let query = trx('seed_artifacts')
      .join('seed_runs', 'seed_runs.id', 'seed_artifacts.run_id')
      .whereRaw("'demo' = any(seed_runs.tags) OR 'cld' = any(seed_runs.tags)");

    // Apply filters
    if (filters.seedName) {
      query = query.where('seed_runs.name', filters.seedName);
    }

    if (filters.company || filters.country || filters.companyType) {
      // Need to filter by context parameters
      if (filters.company) {
        query = query.whereRaw("seed_runs.params->>'companyId' = ?", [filters.company]);
      }
      if (filters.country) {
        query = query.whereRaw("seed_runs.params->>'country' = ?", [filters.country]);
      }
      if (filters.companyType) {
        query = query.whereRaw("seed_runs.params->>'companyType' = ?", [filters.companyType]);
      }
    }

    // Get artifacts to delete
    const artifacts = await query.select([
      'seed_artifacts.table_name',
      'seed_artifacts.pk',
      'seed_runs.id as run_id',
    ]);

    // Group by table for efficient deletion
    const byTable = new Map<string, any[]>();
    artifacts.forEach((artifact) => {
      const table = artifact.table_name;
      const pk = JSON.parse(artifact.pk);
      if (!byTable.has(table)) byTable.set(table, []);
      byTable.get(table)!.push(pk);
    });

    // Delete in dependency order
    const deletionOrder = [
      'journal_entries',
      'journal_batches',
      'ledger_transactions',
      'bank_transaction_batches',
      'projects',
      'contacts',
      'bank_accounts',
      'coa',
      'user_company_roles',
      'companies',
      'users',
    ];

    let recordsDeleted = 0;
    const tablesAffected: string[] = [];

    for (const table of deletionOrder) {
      const pks = byTable.get(table);
      if (!pks || pks.length === 0) continue;

      for (const pk of pks) {
        try {
          const deleteCount = await trx(table).where(pk).delete();
          recordsDeleted += deleteCount;
          if (deleteCount > 0 && !tablesAffected.includes(table)) {
            tablesAffected.push(table);
          }
        } catch (error) {
          console.warn(`Warning: Could not delete from ${table}:`, error);
        }
      }
    }

    // Clean up seed registry
    const runIds = [...new Set(artifacts.map((a) => a.run_id))];
    if (runIds.length > 0) {
      await trx('seed_artifacts').whereIn('run_id', runIds).delete();
      await trx('seed_runs').whereIn('id', runIds).delete();
    }

    return { tablesAffected, recordsDeleted };
  });
}
