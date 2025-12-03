import type { Knex } from 'knex';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import type { RuleEngineResult } from '../rules/rules.engine.types.js';

export interface HandlePostPredictionParams {
  source: 'rule' | 'ml';
  event: TransactionEnrichedEventData;
  result: RuleEngineResult | null; // For rules, this is RuleEngineResult; for ML, will be ML result
  runId: string;
  error?: unknown;
  trx: Knex.Transaction;
}

// Internal interface for rule-specific handling
export interface HandleRulePredictionParams {
  event: TransactionEnrichedEventData;
  ruleResult: RuleEngineResult | null;
  runId: string;
  error?: unknown;
  trx: Knex.Transaction;
}
