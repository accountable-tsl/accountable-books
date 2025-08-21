import type { Knex } from 'knex';
import crypto from 'crypto';
import type {
  SeedStep,
  StepId,
  SeedContext,
  MarkFunction,
  SeedExecutionResult,
  ProgressCallback,
  DemoCompanyConfig,
} from './types.js';

export class StepBasedSeedRunner {
  private knex: Knex;
  private progressCallback?: ProgressCallback;

  constructor(knex: Knex, progressCallback?: ProgressCallback) {
    this.knex = knex;
    this.progressCallback = progressCallback;
  }

  // Apply steps to scenarios with surgical precision
  async applySteps(
    scenarios: DemoCompanyConfig[],
    steps: SeedStep[],
    options: { force?: boolean; parallel?: boolean } = {},
  ): Promise<SeedExecutionResult[]> {
    const results: SeedExecutionResult[] = [];

    // Sort steps by dependencies
    const sortedSteps = this.sortStepsByDependencies(steps);

    for (const scenario of scenarios) {
      this.reportProgress(`Processing ${scenario.shortCode}`, 0, scenarios.length);

      for (const step of sortedSteps) {
        const result = await this.executeStep(scenario, step, options);
        results.push(result);

        if (!result.success && !options.force) {
          throw new Error(
            `Step ${step.id} failed for ${scenario.shortCode}: ${result.error?.message}`,
          );
        }
      }
    }

    return results;
  }

  // Add a specific step to targeted scenarios
  async addStep(
    scenarios: DemoCompanyConfig[],
    step: SeedStep,
    options: { force?: boolean } = {},
  ): Promise<SeedExecutionResult[]> {
    const results: SeedExecutionResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.executeStep(scenario, step, options);
      results.push(result);
    }

    return results;
  }

  // Execute a single step for a scenario
  async executeStep(
    scenario: DemoCompanyConfig,
    step: SeedStep,
    options: { force?: boolean } = {},
  ): Promise<SeedExecutionResult> {
    const startTime = Date.now();
    let artifactsCreated = 0;

    try {
      const seedName = this.buildSeedName(scenario, step);
      const tags = this.buildTags(scenario, step);
      const context = this.buildContext(scenario);
      const checksum = this.generateChecksum(seedName, step.version, context);

      this.reportProgress(`${seedName}`, 0, 1);

      // Check idempotency
      if (!options.force) {
        const existingRun = await this.knex('seed_runs')
          .where({
            name: seedName,
            version: step.version,
            checksum,
          })
          .andWhere('params', '=', this.knex.raw('?::jsonb', [JSON.stringify(context)]))
          .first();

        if (existingRun) {
          this.reportProgress(`${seedName} (idempotent)`, 1, 1);
          return {
            success: true,
            seedName,
            duration: Date.now() - startTime,
            artifactsCreated: 0,
            message: 'Already applied (idempotent)',
          };
        }
      }

      // Execute within transaction
      await this.knex.transaction(async (trx) => {
        await trx.raw('SET CONSTRAINTS ALL DEFERRED');

        // Record the seed run
        const [seedRun] = await trx('seed_runs')
          .insert({
            name: seedName,
            version: step.version,
            tags,
            params: JSON.stringify(context),
            checksum,
            description: step.description,
          })
          .returning('*');

        // Enhanced mark function with operation tracking
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

        // Execute the step
        await step.up(trx, context, mark);
      });

      const duration = Date.now() - startTime;
      this.reportProgress(`${seedName} (completed)`, 1, 1);

      return {
        success: true,
        seedName,
        duration,
        artifactsCreated,
        message: `Successfully applied ${step.id} to ${scenario.shortCode}`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.reportProgress(`${step.id} (failed)`, 0, 1, (error as Error).message);

      return {
        success: false,
        seedName: this.buildSeedName(scenario, step),
        duration,
        artifactsCreated,
        error: error as Error,
      };
    }
  }

  // Generic artifact-driven purge (best of seeds-dex)
  async purgeByFilters(filters: {
    country?: string;
    companyType?: string;
    company?: string;
    step?: StepId;
    all?: boolean;
  }): Promise<{ tablesAffected: string[]; recordsDeleted: number; runsDeleted: number }> {
    return this.knex.transaction(async (trx) => {
      await trx.raw('SET CONSTRAINTS ALL DEFERRED');

      // Build tag filters
      const tagFilters: string[] = ['demo']; // Always include demo tag
      if (filters.country) tagFilters.push(`country:${filters.country.toUpperCase()}`);
      if (filters.companyType) tagFilters.push(`type:${filters.companyType}`);
      if (filters.company) tagFilters.push(`company:${filters.company}`);
      if (filters.step) tagFilters.push(`step:${filters.step}`);

      // Find matching seed runs
      let runsQuery = trx('seed_runs');

      if (filters.all) {
        runsQuery = runsQuery.whereRaw("'demo' = ANY(tags)");
      } else {
        runsQuery = runsQuery.whereRaw('tags && ?::text[]', [tagFilters]);
      }

      const runs = await runsQuery.select('id', 'name').orderBy('applied_at', 'desc');

      if (runs.length === 0) {
        return { tablesAffected: [], recordsDeleted: 0, runsDeleted: 0 };
      }

      console.log(`🔍 Found ${runs.length} seed runs to purge`);

      // Get all artifacts for these runs
      const artifacts = await trx('seed_artifacts')
        .whereIn(
          'run_id',
          runs.map((r) => r.id),
        )
        .select('table_name', 'pk', 'run_id')
        .orderBy('created_at', 'desc'); // Reverse chronological order

      // Group artifacts by table for efficient deletion
      const artifactsByTable = new Map<string, any[]>();
      artifacts.forEach((artifact) => {
        const table = artifact.table_name;
        const pk = JSON.parse(artifact.pk);

        if (!artifactsByTable.has(table)) {
          artifactsByTable.set(table, []);
        }
        artifactsByTable.get(table)!.push(pk);
      });

      // Delete in dependency order (reverse of creation)
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
        const pks = artifactsByTable.get(table);
        if (!pks || pks.length === 0) continue;

        try {
          for (const pk of pks) {
            const deleteCount = await trx(table).where(pk).delete();
            recordsDeleted += deleteCount;
          }

          if (pks.length > 0) {
            tablesAffected.push(table);
            console.log(`  ✓ Deleted ${pks.length} records from ${table}`);
          }
        } catch (error) {
          console.warn(`⚠️  Warning: Could not delete from ${table}:`, error);
        }
      }

      // Clean up seed registry
      const runIds = runs.map((r) => r.id);
      await trx('seed_artifacts').whereIn('run_id', runIds).delete();
      const runsDeleted = await trx('seed_runs').whereIn('id', runIds).delete();

      return { tablesAffected, recordsDeleted, runsDeleted };
    });
  }

  // Build step-aware seed name
  private buildSeedName(scenario: DemoCompanyConfig, step: SeedStep): string {
    return `demo:${scenario.country}:${scenario.companyType}:${scenario.shortCode}:${step.id}`;
  }

  // Build rich tagging system (best of seeds-dex)
  private buildTags(scenario: DemoCompanyConfig, step: SeedStep): string[] {
    return [
      'demo',
      'cld', // Claude implementation
      'tenant',
      `country:${scenario.country}`,
      `type:${scenario.companyType}`,
      `company:${scenario.shortCode}`,
      `step:${step.id}`,
    ];
  }

  // Build rich context
  private buildContext(scenario: DemoCompanyConfig): SeedContext {
    return {
      country: scenario.country,
      companyType: scenario.companyType,
      companyId: scenario.shortCode, // Will be resolved to actual ID
      companyShortCode: scenario.shortCode,
      scenario: scenario.dataScenarios[0] || 'default',
      user: scenario.user,
      company: {
        legalName: scenario.legalName,
        shortCode: scenario.shortCode,
      },
    };
  }

  // Sort steps by dependencies
  private sortStepsByDependencies(steps: SeedStep[]): SeedStep[] {
    const sorted: SeedStep[] = [];
    const visiting = new Set<StepId>();
    const visited = new Set<StepId>();
    const stepMap = new Map(steps.map((step) => [step.id, step]));

    const visit = (stepId: StepId) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected in step: ${stepId}`);
      }

      const step = stepMap.get(stepId);
      if (!step) {
        throw new Error(`Step dependency not found: ${stepId}`);
      }

      visiting.add(stepId);

      // Visit dependencies first
      for (const dep of step.dependencies) {
        visit(dep);
      }

      visiting.delete(stepId);
      visited.add(stepId);
      sorted.push(step);
    };

    // Visit all steps
    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step.id);
      }
    }

    return sorted;
  }

  // Generate checksum for idempotency
  private generateChecksum(name: string, version: number, context: SeedContext): string {
    return this.sha256({ name, version, context });
  }

  // SHA256 utility
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

// Helper function to create step context
export function createStepContext(
  scenario: DemoCompanyConfig,
  additionalContext: Record<string, any> = {},
): SeedContext {
  return {
    country: scenario.country,
    companyType: scenario.companyType,
    companyShortCode: scenario.shortCode,
    dataScenarios: scenario.dataScenarios,
    user: scenario.user,
    company: {
      legalName: scenario.legalName,
      shortCode: scenario.shortCode,
    },
    ...additionalContext,
  };
}

// Upsert utility with conflict resolution
export async function upsertByKey<T extends Record<string, any>>(
  trx: Knex.Transaction,
  table: string,
  keys: string[],
  data: T | T[],
): Promise<T[]> {
  const records = Array.isArray(data) ? data : [data];
  const conflictColumns = keys.map((k) => `"${k}"`).join(',');

  const results: T[] = [];

  for (const record of records) {
    const [result] = await trx(table)
      .insert(record)
      .onConflict(trx.raw(`(${conflictColumns})`))
      .merge()
      .returning('*');
    results.push(result);
  }

  return results;
}
