import type { Knex } from 'knex';

import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import type { MLPredictionOutput } from '../ml/ml-prediction.types.js';
import type { RuleEngineResult } from '../rules/rules.engine.types.js';

// export interface HandlePostPredictionParams {
//   source: TxnCategorizationSource;
//   event: TransactionEnrichedEventData;
//   result: RuleEngineResult | null; // For rules, this is RuleEngineResult; for ML, will be ML result
//   runId: string;
//   error?: unknown;
//   trx: Knex.Transaction;
// }

// Internal interface for rule-specific handling
export interface HandleRulePredictionParams {
  source: 'rule';
  event: TransactionEnrichedEventData;
  ruleResult: RuleEngineResult | null;
  runId: string;
  error?: unknown;
  rulesLatencyMs?: number; // Latency for rules processing
  trx: Knex.Transaction;
}

export interface HandleMlPredictionParams {
  source: 'ml' | 'ml_heuristic';
  event: TransactionEnrichedEventData;
  mlResult: MLPredictionOutput;
  runId: string;
  error?: unknown;
  mlLatencyMs?: number; // Latency for ML processing
  trx?: Knex.Transaction;
}

export type HandlePostPredictionParams =
  | HandleRulePredictionParams
  | HandleMlPredictionParams;
