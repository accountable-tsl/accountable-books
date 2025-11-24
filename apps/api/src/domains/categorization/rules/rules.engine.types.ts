import type { RuleDirectionFilter, RuleScope } from './rules-db.types.js';

export interface RuleTransactionContext {
  companyId: string;
  transactionId: string;
  transactionDate: string; // ISO date (YYYY-MM-DD)
  bankAccountId?: string | null;
  amount: number;
  direction: Exclude<RuleDirectionFilter, 'all'>;
  description?: string | null;
  reference?: string | null;
  payee?: string | null;
  currencyCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompanyScopeContext {
  companyId: string;
  regionCode?: string | null;
  countryCode?: string | null;
  subregionCode?: string | null;
}

export interface RuleEngineRunOptions {
  runId?: string;
  debug?: boolean;
  includeDisabledRules?: boolean;
  scopes?: RuleScope[];
}
export interface RuleEngineInput {
  transaction: RuleTransactionContext;
  company: CompanyScopeContext;
  options?: RuleEngineRunOptions;
}
