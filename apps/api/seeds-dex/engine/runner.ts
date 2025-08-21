import type { Knex } from 'knex';
import knex from 'knex';
import { knexClient } from '../../src/db/knexClient';
import { createRegistry, type Registry, type StepId, type Scenario } from './registry';
import { withSeedRun, purgeByFilters, listRuns } from './helpers';
import { getAllScenarios } from '../scenarios';

// Steps
import * as stepBase from '../steps/000_base';
import * as stepContacts from '../steps/010_contacts';
import * as stepProjects from '../steps/020_projects';
import * as stepBankAccounts from '../steps/030_bank_accounts';
import * as stepBankTransactions from '../steps/040_bank_transactions';

export type TargetFilters = {
  country?: 'US' | 'NG';
  type?: 'individual' | 'business' | 'accounting_firm';
  company?: string; // shortCode
};

type BuildOpts = { configPath?: string };

export async function buildRegistry(opts: BuildOpts = {}): Promise<Registry> {
  const scenarios = await getAllScenarios(opts.configPath);
  const steps = [
    { id: 'base', version: 1, up: stepBase.up },
    { id: 'contacts', version: 1, up: stepContacts.up },
    { id: 'projects', version: 1, up: stepProjects.up },
    { id: 'bank-accounts', version: 1, up: stepBankAccounts.up },
    { id: 'bank-transactions', version: 1, up: stepBankTransactions.up },
  ] as const;

  return createRegistry({ steps: steps as any, scenarios });
}

export async function applyAll(
  knex: Knex,
  filters: TargetFilters,
  stepFilter?: StepId[],
  opts: { parallel?: boolean; bail?: boolean; configPath?: string } = {},
) {
  const registry = await buildRegistry({ configPath: opts.configPath });
  const scenarios = registry.resolveScenarios(filters);
  const steps = registry.resolveSteps(stepFilter);
  const total = scenarios.length * steps.length;
  let done = 0;

  console.log(
    `➡️  Targets: ${scenarios.length} scenario(s), ${steps.length} step(s)${opts.parallel ? ' • parallel' : ''}${opts.bail ? ' • bail' : ''}`,
  );

  const runScenario = async (s: Scenario) => {
    console.log(`▶️  ${s.company.shortCode} (${s.country} • ${s.type})`);
    for (const st of steps) {
      const name = seedName(s, st.id);
      const tags = seedTags(s, st.id);
      const ctx = seedCtx(s);
      try {
        await withSeedRun(knex, { name, version: st.version, tags }, ctx, async (trx, mark) => {
          await st.up(trx, ctx, mark);
        });
        done += 1;
        console.log(`   ✓ ${st.id}  [${done}/${total}]`);
      } catch (err) {
        console.error(
          `❌ Failed step ${st.id} for ${s.company.shortCode}:`,
          (err as Error).message,
        );
        if (opts.bail) throw err;
      }
    }
  };

  if (opts.parallel) await Promise.all(scenarios.map(runScenario));
  else for (const s of scenarios) await runScenario(s);
}

export async function addStep(
  knex: Knex,
  filters: TargetFilters,
  step: StepId,
  opts: { parallel?: boolean; bail?: boolean; configPath?: string } = {},
) {
  return applyAll(knex, filters, [step], opts);
}

export async function purge(knex: Knex, filters: TargetFilters & { step?: StepId }) {
  const deleted = await purgeByFilters(knex, {
    country: filters.country,
    type: filters.type,
    company: filters.company,
    step: filters.step,
  });
  console.log(`🧹 Purged ${deleted} rows`);
}

export async function list() {
  const rows = await listRuns(knexClient);
  console.table(
    rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      tags: r.tags,
      applied_at: r.applied_at,
    })),
  );
}

export async function status(filters: TargetFilters, opts: { configPath?: string } = {}) {
  const registry = await buildRegistry({ configPath: opts.configPath });
  const scenarios = registry.resolveScenarios(filters);
  const names = new Set(scenarios.flatMap((s) => registry.steps.map((st) => seedName(s, st.id))));
  const runs = await knexClient('seed_runs')
    .whereIn('name', Array.from(names))
    .orderBy('applied_at', 'desc');
  console.table(
    runs.map((r: any) => ({ name: r.name, version: r.version, applied_at: r.applied_at })),
  );
}

function seedName(s: Scenario, step: StepId) {
  return `demo:${s.country}:${s.type}:${s.company.shortCode}:${step}`;
}

function seedTags(s: Scenario, step: StepId): string[] {
  return [
    'demo',
    'tenant',
    `country:${s.country}`,
    `type:${s.type}`,
    `company:${s.company.shortCode}`,
    `step:${step}`,
  ];
}

function seedCtx(s: Scenario) {
  return {
    country: s.country,
    type: s.type,
    companyShortCode: s.company.shortCode,
    countryId: s.company.countryId,
    reportingCurrencyId: s.company.reportingCurrencyId,
    userEmail: s.user.email,
    user: s.user,
    company: s.company,
  } as const;
}
