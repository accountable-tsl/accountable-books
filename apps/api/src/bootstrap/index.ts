import type { Knex } from 'knex';

import { bootstrapAccountElements } from './phases/account-elements.bootstrap.js';
import { bootstrapAccountTypes } from './phases/account-types.bootstrap.js';
import { bootstrapCoaTemplates } from './phases/coa-templates.bootstrap.js';
import { bootstrapCountries } from './phases/countries.bootstrap.js';
import { bootstrapCurrencies } from './phases/currencies.bootstrap.js';
import { bootstrapFinancialStatements } from './phases/financial-statements.bootstrap.js';
import { bootstrapFxSeeds } from './phases/fx-seeds.bootstrap.js';
import { bootstrapRoles } from './phases/roles.bootstrap.js';
import { bootstrapUsers } from './phases/users.bootstrap.js';

import type { RoleKey } from '../domains/roles/roles.types.js';
import type { AccountElementKey } from './catalogs/accounting/account-elements.js';
import type { AccountTypeKey } from './catalogs/accounting/account-types.js';
import type { FinancialStatementKey } from './catalogs/accounting/financial-statements.js';
import type { LoadFxPackResult } from './catalogs/fx/load-fx-pack.js';
import type { BootstrappedAccountElement } from './phases/account-elements.bootstrap.js';
import type { BootstrappedAccountType } from './phases/account-types.bootstrap.js';
import type { BootstrappedCoaTemplate } from './phases/coa-templates.bootstrap.js';
import type { BootstrappedCountry } from './phases/countries.bootstrap.js';
import type { BootstrappedCurrency } from './phases/currencies.bootstrap.js';
import type { BootstrappedFinancialStatement } from './phases/financial-statements.bootstrap.js';
import type { FxSeedPackId } from './phases/fx-seeds.bootstrap.js';
import type { BootstrappedRole } from './phases/roles.bootstrap.js';
import type { SystemUser } from './phases/users.bootstrap.js';

export const BOOTSTRAP_PHASES = [
  'users',
  'roles',
  'countries',
  'currencies',
  'financial-statements',
  'account-elements',
  'account-types',
  'coa-templates',
  'fx-seeds',
] as const;

export type BootstrapPhase = (typeof BOOTSTRAP_PHASES)[number];

export type BootstrapContext = {
  systemUser?: SystemUser;
  rolesByKey?: Record<RoleKey, BootstrappedRole>;
  countriesByCode?: Record<string, BootstrappedCountry>;
  currenciesByCode?: Record<string, BootstrappedCurrency>;
  financialStatementsByKey?: Record<
    FinancialStatementKey,
    BootstrappedFinancialStatement
  >;
  accountElementsByKey?: Record<AccountElementKey, BootstrappedAccountElement>;
  accountTypesByKey?: Record<AccountTypeKey, BootstrappedAccountType>;
  coaTemplatesByNaturalKey?: Record<string, BootstrappedCoaTemplate>;
  fxSeedResults?: LoadFxPackResult[];
};

export type BootstrapResult = {
  phases: BootstrapPhase[];
  context: BootstrapContext;
  phaseExecutions: BootstrapPhaseExecution[];
};

export type BootstrapPhaseExecution = {
  phase: BootstrapPhase;
  status: 'success' | 'failed';
  startedAt: string;
  durationMs: number;
  errorMessage?: string;
};

export type RunBootstrapOptions = {
  phases?: BootstrapPhase[];
  fxSeedPackIds?: FxSeedPackId[];
};

export class BootstrapPhaseExecutionError extends Error {
  readonly phase: BootstrapPhase;
  readonly phaseExecutions: BootstrapPhaseExecution[];

  constructor(
    phase: BootstrapPhase,
    phaseExecutions: BootstrapPhaseExecution[],
    cause: unknown,
  ) {
    const message =
      cause instanceof Error
        ? `Bootstrap phase "${phase}" failed: ${cause.message}`
        : `Bootstrap phase "${phase}" failed: ${String(cause)}`;
    super(message);
    this.name = 'BootstrapPhaseExecutionError';
    this.phase = phase;
    this.phaseExecutions = phaseExecutions;
  }
}

type BootstrapPhaseDefinition = {
  dependsOn: BootstrapPhase[];
  defaultEnabled: boolean;
  run: (
    trx: Knex.Transaction,
    context: BootstrapContext,
    options: RunBootstrapOptions,
  ) => Promise<void>;
};

function assertBootstrapPhase(value: string): asserts value is BootstrapPhase {
  if (BOOTSTRAP_PHASES.includes(value as BootstrapPhase)) {
    return;
  }

  throw new Error(
    `Unknown bootstrap phase "${value}". Allowed phases: ${BOOTSTRAP_PHASES.join(', ')}`,
  );
}

function requireContextValue<T>(
  context: BootstrapContext,
  key: keyof BootstrapContext,
  phase: BootstrapPhase,
): T {
  const value = context[key] as T | undefined;
  if (value !== undefined) {
    return value;
  }

  throw new Error(
    `Bootstrap phase "${phase}" requires context "${String(key)}", but it was not initialized.`,
  );
}

const BOOTSTRAP_PHASE_REGISTRY: Record<
  BootstrapPhase,
  BootstrapPhaseDefinition
> = {
  users: {
    dependsOn: [],
    defaultEnabled: true,
    run: async (trx, context) => {
      const { systemUser } = await bootstrapUsers(trx);
      context.systemUser = systemUser;
    },
  },
  roles: {
    dependsOn: [],
    defaultEnabled: true,
    run: async (trx, context) => {
      const { rolesByKey } = await bootstrapRoles(trx);
      context.rolesByKey = rolesByKey;
    },
  },
  countries: {
    dependsOn: [],
    defaultEnabled: true,
    run: async (trx, context) => {
      const { countriesByCode } = await bootstrapCountries(trx);
      context.countriesByCode = countriesByCode;
    },
  },
  currencies: {
    dependsOn: [],
    defaultEnabled: true,
    run: async (trx, context) => {
      const { currenciesByCode } = await bootstrapCurrencies(trx);
      context.currenciesByCode = currenciesByCode;
    },
  },
  'financial-statements': {
    dependsOn: [],
    defaultEnabled: true,
    run: async (trx, context) => {
      const { financialStatementsByKey } =
        await bootstrapFinancialStatements(trx);
      context.financialStatementsByKey = financialStatementsByKey;
    },
  },
  'account-elements': {
    dependsOn: ['financial-statements'],
    defaultEnabled: true,
    run: async (trx, context) => {
      const financialStatementsByKey = requireContextValue<
        Record<FinancialStatementKey, BootstrappedFinancialStatement>
      >(context, 'financialStatementsByKey', 'account-elements');

      const { accountElementsByKey } = await bootstrapAccountElements(trx, {
        financialStatementsByKey,
      });
      context.accountElementsByKey = accountElementsByKey;
    },
  },
  'account-types': {
    dependsOn: ['account-elements'],
    defaultEnabled: true,
    run: async (trx, context) => {
      const accountElementsByKey = requireContextValue<
        Record<AccountElementKey, BootstrappedAccountElement>
      >(context, 'accountElementsByKey', 'account-types');

      const { accountTypesByKey } = await bootstrapAccountTypes(trx, {
        accountElementsByKey,
      });
      context.accountTypesByKey = accountTypesByKey;
    },
  },
  'coa-templates': {
    dependsOn: ['account-types'],
    defaultEnabled: true,
    run: async (trx, context) => {
      const accountTypesByKey = requireContextValue<
        Record<AccountTypeKey, BootstrappedAccountType>
      >(context, 'accountTypesByKey', 'coa-templates');

      const { coaTemplatesByNaturalKey } = await bootstrapCoaTemplates(trx, {
        accountTypesByKey,
      });
      context.coaTemplatesByNaturalKey = coaTemplatesByNaturalKey;
    },
  },
  'fx-seeds': {
    dependsOn: ['currencies'],
    defaultEnabled: false,
    run: async (trx, context, options) => {
      const currenciesByCode = requireContextValue<
        Record<string, BootstrappedCurrency>
      >(context, 'currenciesByCode', 'fx-seeds');
      const packIds = options.fxSeedPackIds;

      if (!packIds || packIds.length === 0) {
        throw new Error(
          'Bootstrap phase "fx-seeds" requires one or more pack ids in "fxSeedPackIds".',
        );
      }

      const { results } = await bootstrapFxSeeds(trx, {
        currenciesByCode,
        packIds,
      });
      context.fxSeedResults = results;
    },
  },
};

function collectDependencies(
  phase: BootstrapPhase,
  collected: Set<BootstrapPhase>,
): void {
  if (collected.has(phase)) return;
  collected.add(phase);

  const definition = BOOTSTRAP_PHASE_REGISTRY[phase];
  for (const dependency of definition.dependsOn) {
    collectDependencies(dependency, collected);
  }
}

function topologicalSort(phases: Set<BootstrapPhase>): BootstrapPhase[] {
  const ordered: BootstrapPhase[] = [];
  const permanent = new Set<BootstrapPhase>();
  const temporary = new Set<BootstrapPhase>();

  const visit = (phase: BootstrapPhase): void => {
    if (permanent.has(phase)) return;
    if (temporary.has(phase)) {
      throw new Error(
        `Bootstrap phase dependency cycle detected at "${phase}".`,
      );
    }

    temporary.add(phase);
    const definition = BOOTSTRAP_PHASE_REGISTRY[phase];

    for (const dependency of definition.dependsOn) {
      if (phases.has(dependency)) {
        visit(dependency);
      }
    }

    temporary.delete(phase);
    permanent.add(phase);
    ordered.push(phase);
  };

  for (const phase of BOOTSTRAP_PHASES) {
    if (phases.has(phase)) {
      visit(phase);
    }
  }

  return ordered;
}

export function resolveBootstrapPlan(
  options: RunBootstrapOptions = {},
): BootstrapPhase[] {
  const requested =
    options.phases && options.phases.length > 0
      ? options.phases
      : BOOTSTRAP_PHASES.filter(
          (phase) => BOOTSTRAP_PHASE_REGISTRY[phase].defaultEnabled,
        );

  for (const phase of requested) {
    assertBootstrapPhase(phase);
  }

  const withDependencies = new Set<BootstrapPhase>();
  for (const phase of requested) {
    collectDependencies(phase, withDependencies);
  }

  return topologicalSort(withDependencies);
}

export async function runBootstrap(
  db: Knex,
  options: RunBootstrapOptions = {},
): Promise<BootstrapResult> {
  const plannedPhases = resolveBootstrapPlan(options);
  const includesFxSeeds = plannedPhases.includes('fx-seeds');

  if (
    includesFxSeeds &&
    (!options.fxSeedPackIds || options.fxSeedPackIds.length === 0)
  ) {
    throw new Error(
      'Bootstrap phase "fx-seeds" requires one or more pack ids in "fxSeedPackIds".',
    );
  }

  return db.transaction(async (trx) => {
    const context: BootstrapContext = {};
    const phases: BootstrapPhase[] = [];
    const phaseExecutions: BootstrapPhaseExecution[] = [];

    for (const phase of plannedPhases) {
      const definition = BOOTSTRAP_PHASE_REGISTRY[phase];
      const startedMs = Date.now();
      const startedAt = new Date(startedMs).toISOString();

      try {
        await definition.run(trx, context, options);
        phases.push(phase);
        phaseExecutions.push({
          phase,
          status: 'success',
          startedAt,
          durationMs: Date.now() - startedMs,
        });
      } catch (error) {
        phaseExecutions.push({
          phase,
          status: 'failed',
          startedAt,
          durationMs: Date.now() - startedMs,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw new BootstrapPhaseExecutionError(phase, phaseExecutions, error);
      }
    }

    return {
      phases,
      context,
      phaseExecutions,
    };
  });
}
