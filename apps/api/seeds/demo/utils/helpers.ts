import type { Knex } from 'knex';
import crypto from 'crypto';

export interface SeedContext {
  companyId?: string;
  companyShortCode?: string;
  variant?: string;
  [key: string]: any;
}

export interface SeedDefinition {
  name: string;
  version: number;
  tags: string[];
  up(knex: Knex, ctx: SeedContext): Promise<void>;
  down(knex: Knex, ctx: SeedContext): Promise<void>;
}

export type MarkFunction = (table: string, pk: Record<string, any>, row?: any) => Promise<void>;

/**
 * Generate SHA256 hash for deterministic checksums
 */
export function sha256(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * Execute a seed within a transaction with automatic tracking
 */
export async function withSeedRun(
  knex: Knex,
  seed: SeedDefinition,
  ctx: SeedContext,
  run: (trx: Knex.Transaction, mark: MarkFunction) => Promise<void>,
): Promise<void> {
  const checksum = sha256({ name: seed.name, version: seed.version, ctx });

  await knex.transaction(async (trx) => {
    // Defer constraints for complex operations
    await trx.raw('SET CONSTRAINTS ALL DEFERRED');

    // Check if this exact seed run already exists (idempotency)
    const exists = await trx('seed_runs')
      .where({
        name: seed.name,
        version: seed.version,
        checksum,
      })
      .andWhere('params', '=', trx.raw('?::jsonb', [JSON.stringify(ctx)]))
      .first();

    if (exists) {
      console.log(`⏭️  Seed "${seed.name}" v${seed.version} already applied (idempotent)`);
      return;
    }

    console.log(`🌱 Applying seed: ${seed.name} v${seed.version}`);

    // Record the seed run
    const [seedRun] = await trx('seed_runs')
      .insert({
        name: seed.name,
        version: seed.version,
        tags: seed.tags,
        params: JSON.stringify(ctx),
        checksum,
      })
      .returning('*');

    // Create mark function for tracking artifacts
    const mark: MarkFunction = async (table, pk, row) => {
      await trx('seed_artifacts').insert({
        run_id: seedRun.id,
        table_name: table,
        pk: JSON.stringify(pk),
        company_id: pk.company_id ?? ctx.companyId ?? null,
        checksum: row ? sha256(row) : null,
      });
    };

    // Execute the seed logic
    await run(trx, mark);
  });
}

/**
 * Upsert helper with conflict resolution
 */
export async function upsertByKey<T extends Record<string, any>>(
  trx: Knex.Transaction,
  table: string,
  keys: string[],
  data: T,
): Promise<T[]> {
  const conflictColumns = keys.map((k) => `"${k}"`).join(',');

  return trx(table)
    .insert(data)
    .onConflict(trx.raw(`(${conflictColumns})`))
    .merge()
    .returning('*');
}

/**
 * Safe delete in dependency order
 */
export async function purgeCompanyData(
  trx: Knex.Transaction,
  companyId: string,
  seedName?: string,
): Promise<void> {
  // Define deletion order based on your schema dependencies
  const deletionOrder = ['invoices', 'projects', 'contacts', 'bank_accounts', 'users', 'companies'];

  for (const table of deletionOrder) {
    try {
      const query = trx(table).where('company_id', companyId);
      const count = await query.clone().count();

      if (Number(count[0].count) > 0) {
        await query.delete();
        console.log(`  ✓ Deleted ${count[0].count} records from ${table}`);
      }
    } catch (error) {
      // Table might not have company_id or might not exist
      if (table === 'companies') {
        await trx('companies').where('id', companyId).delete();
      }
    }
  }

  // Clean up seed artifacts
  if (seedName) {
    await trx.raw(
      `
        DELETE FROM seed_artifacts 
        USING seed_runs
        WHERE seed_artifacts.run_id = seed_runs.id
          AND seed_runs.name = ?
          AND (seed_artifacts.company_id IS NULL OR seed_artifacts.company_id = ?::uuid)
      `,
      [seedName, companyId],
    );
  }
}
