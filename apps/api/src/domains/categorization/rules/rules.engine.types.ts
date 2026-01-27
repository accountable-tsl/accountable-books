import type { RuleLogDraft } from './rule-logs.types.js';
import type { RuleDirectionFilter, RuleScope } from './rules-db.types.js';
import type { RuleDraftState } from './rules.types.js';

/**
 * ============================================================
 * Engine-level types (engine I/O)
 * - Input/output types for the rules engine
 * - Runtime options and results
 * ============================================================
 */

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
  regionCode: string | null;
  countryCode: string | null;
  subregionCode: string | null;
}

export interface RuleEngineInput {
  transaction: RuleTransactionContext;
  company: CompanyScopeContext;
  options: RuleEngineRunOptions;
}

export interface RuleEngineRunOptions {
  runId: string;
  debug?: boolean;
  includeDisabledRules?: boolean;
  scopes?: RuleScope[];
}

export interface RuleEngineResult {
  runId: string;
  transactionId: string;
  transactionDate: string;
  logs: RuleLogDraft[];
  finalState: RuleDraftState;
  status: 'no_match' | 'applied' | 'conflict' | 'error';
  appliedRuleIds: string[]; // All rules that successfully applied (in evaluation order).
  needsReview: boolean;
  conflictingField?: string | null;
  debugLogs?: RuleLogDraft[];
}
