import type { Knex } from 'knex';
import crypto from 'crypto';

export interface SeedCtx {
  country: 'US' | 'NG' | string;
  type: 'individual' | 'business' | 'accounting_firm';
  companyShortCode: string;
  countryId: string;
  reportingCurrencyId: string;
  userEmail: string;
  user: any;
  company: any;
  includeTransactions?: boolean;
  [key: string]: unknown;
}

export type MarkFn = (table: string, pk: Record<string, any>, row?: any) => Promise<void>;

export function sha256(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export async function withSeedRun(
  knex: Knex,
  seed: { name: string; version: number; tags: string[] },
  ctx: SeedCtx,
  run: (trx: Knex.Transaction, mark: MarkFn) => Promise<void>,
  opts: { force?: boolean } = {},
): Promise<void> {
  const checksum = sha256({ name: seed.name, version: seed.version, ctx });

  await knex.transaction(async (trx) => {
    await trx.raw('SET CONSTRAINTS ALL DEFERRED');

    if (!opts.force) {
      const exists = await trx('seed_runs')
        .where({ name: seed.name, version: seed.version, checksum })
        .andWhere('params', '=', trx.raw('?::jsonb', [JSON.stringify(ctx)]))
        .first();
      if (exists) {
        console.log(`⏭️  Seed "${seed.name}" v${seed.version} already applied`);
        return;
      }
    }

    console.log(`🌱 Applying seed: ${seed.name} v${seed.version}`);

    const [seedRun] = await trx('seed_runs')
      .insert({
        name: seed.name,
        version: seed.version,
        tags: seed.tags,
        params: JSON.stringify(ctx),
        checksum,
      })
      .returning('*');

    const mark: MarkFn = async (table, pk, row) => {
      await trx('seed_artifacts').insert({
        run_id: seedRun.id,
        table_name: table,
        pk: JSON.stringify(pk),
        company_id: pk.company_id ?? ctx.companyId ?? null,
        checksum: row ? sha256(row) : null,
      });
    };

    await run(trx, mark);
  });
}

export async function purgeByFilters(
  knex: Knex,
  filters: { country?: string; type?: string; company?: string; step?: string },
): Promise<number> {
  const where: any = {};
  const tagFilters: string[] = [];
  if (filters.country) tagFilters.push(`country:${filters.country}`);
  if (filters.type) tagFilters.push(`type:${filters.type}`);
  if (filters.company) tagFilters.push(`company:${filters.company}`);
  if (filters.step) tagFilters.push(`step:${filters.step}`);

  const runs = await knex('seed_runs')
    .modify((qb) => {
      if (tagFilters.length) qb.whereRaw('tags && ?', [tagFilters]);
      else qb.whereRaw('tags @> ?', [['demo']]);
    })
    .orderBy('applied_at', 'desc');

  let deleted = 0;
  for (const run of runs) {
    await knex.transaction(async (trx) => {
      await trx.raw('SET CONSTRAINTS ALL DEFERRED');

      const artifacts = await trx('seed_artifacts')
        .where({ run_id: run.id })
        .orderBy('created_at', 'desc');
      for (const a of artifacts) {
        try {
          const pk = a.pk as any;
          const pkObj = typeof pk === 'string' ? JSON.parse(pk) : pk;

          const delQ = trx(a.table_name).where(pkObj);
          const res = await delQ.delete();
          deleted += res || 0;
        } catch (err) {
          console.warn(`⚠️ Failed to delete artifact from ${a.table_name}:`, err);
        }
      }

      await trx('seed_artifacts').where({ run_id: run.id }).delete();
      await trx('seed_runs').where({ id: run.id }).delete();
    });
  }

  return deleted;
}

export async function listRuns(knex: Knex) {
  return knex('seed_runs').orderBy('applied_at', 'desc');
}

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
