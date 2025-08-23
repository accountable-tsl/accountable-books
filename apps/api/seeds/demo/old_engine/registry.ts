import type { Knex } from 'knex';
import type { MarkFn, SeedCtx } from './helpers.js';

export type StepId = 'base' | 'contacts' | 'projects' | 'bank-accounts' | 'bank-transactions';

export type Step = {
  id: StepId;
  version: number;
  up: (knex: Knex, ctx: SeedCtx, mark: MarkFn) => Promise<void>;
  down?: (knex: Knex, ctx: SeedCtx) => Promise<void>;
};

export type Scenario = {
  name: string; // e.g. demo:US:business:bizDemoUS
  country: 'US' | 'NG';
  type: 'individual' | 'business' | 'accounting_firm';
  company: {
    legalName: string;
    shortCode: string;
    slug?: string | null;
    reportingCurrencyId: string;
    countryId: string;
    onboardingState?: any;
    type: Scenario['type'];
    isDemoCompany: boolean;
    yearEndDay: number;
    yearEndMonth: number;
  };
  user: {
    firstname: string;
    lastname?: string | null;
    email: string;
    password: string;
    isDemoUser: boolean;
    emailVerifiedAt?: Date;
    onboardingState?: any;
  };
};

export type ResolverFilters = {
  country?: 'US' | 'NG';
  type?: Scenario['type'];
  company?: string; // shortCode
};

export type Registry = {
  steps: Step[];
  scenarios: Scenario[];
  resolveSteps: (ids?: StepId[]) => Step[];
  resolveScenarios: (filters?: ResolverFilters) => Scenario[];
};

export function createRegistry(input: { steps: Step[]; scenarios: Scenario[] }): Registry {
  const steps = input.steps;
  const scenarios = input.scenarios;

  const resolveSteps = (ids?: StepId[]): Step[] =>
    (ids && ids.length ? steps.filter((s) => ids.includes(s.id)) : steps).sort(
      (a, b) => order(a.id) - order(b.id),
    );

  const resolveScenarios = (filters?: ResolverFilters): Scenario[] => {
    let list = scenarios;
    if (filters?.country) list = list.filter((s) => s.country === filters.country);
    if (filters?.type) list = list.filter((s) => s.type === filters.type);
    if (filters?.company) list = list.filter((s) => s.company.shortCode === filters.company);
    return list;
  };

  return { steps, scenarios, resolveSteps, resolveScenarios };
}

function order(id: StepId): number {
  switch (id) {
    case 'base':
      return 0;
    case 'contacts':
      return 10;
    case 'projects':
      return 20;
    case 'bank-accounts':
      return 30;
    default:
      return 1000;
  }
}
