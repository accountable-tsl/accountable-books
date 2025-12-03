import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import { RulesEngine } from './rules.engine.js';
import type {
  RuleEngineInput,
  RuleEngineResult,
} from './rules.engine.types.js';
import { RuleRepository } from './rules.repository.js';
import { RuleLogRepository } from './rule-logs.repository.js';
import { RuleCompiler } from './rules.compiler.js';
import { handlePostPrediction } from '../post-prediction/index.js';
import { logTaskEventSafe } from '../tasks/index.js';

export interface RuleRunnerDependencies {
  runEngine?: (input: RuleEngineInput) => Promise<RuleEngineResult>;
  knex?: Knex;
}

/**
 * Run rules engine for an enriched transaction
 *
 * This is the main entry point for rule-based categorization.
 * It runs the rules engine and handles all post-processing via handleRulePrediction.
 */
export async function runRulesForEnrichedTransaction(
  event: TransactionEnrichedEventData,
  deps: RuleRunnerDependencies = {},
): Promise<void> {
  const db = deps.knex ?? knexClient;
  const runId = event.run_id;
  let ruleResult: RuleEngineResult | null = null;
  let error: unknown = null;

  // Run everything in a single transaction for atomicity
  await db.transaction(async (trx) => {
    // Log rules_started event
    await logTaskEventSafe({
      categorization_task_id: event.categorization_task_id,
      run_id: runId,
      source: 'rule',
      event_type: 'rules_started',
      event_timestamp: new Date(),
      metadata: null,
      trx,
    });
    try {
      const input = buildRuleEngineInput(event);

      // Run the rules engine within the transaction
      // If a custom runEngine is provided (for testing), use it
      // Otherwise, create a new engine instance with transaction-aware repositories
      if (deps.runEngine) {
        ruleResult = await deps.runEngine(input);
      } else {
        const ruleRepo = new RuleRepository(trx);
        const logWriter = new RuleLogRepository(trx);
        const compiler = new RuleCompiler();
        const engine = new RulesEngine(ruleRepo, compiler, logWriter);
        ruleResult = await engine.run(input);
      }

      logger.info(
        {
          bankTransactionId: event.bank_transaction_id,
          companyId: event.company_uuid,
        },
        'Rule engine run completed',
      );
    } catch (err) {
      error = err;
      logger.error(
        {
          bankTransactionId: event.bank_transaction_id,
          companyId: event.company_uuid,
          error: err,
        },
        'Rule engine run failed',
      );
    }

    // Handle post-prediction processing in the same transaction
    // (task updates, prediction/candidate creation)
    await handlePostPrediction({
      source: 'rule',
      event,
      result: ruleResult,
      runId,
      error,
      trx,
    });

    // Re-throw error if rules engine failed (will rollback transaction)
    if (error) {
      throw error;
    }
  });
}

/**
 * Build rule engine input from transaction enriched event
 */
export function buildRuleEngineInput(
  event: TransactionEnrichedEventData,
): RuleEngineInput {
  const enriched = event.enriched_transaction;
  return {
    transaction: {
      companyId: enriched.ids.company_uuid,
      transactionId: enriched.ids.bank_transaction_id,
      transactionDate: enriched.raw.date,
      bankAccountId: enriched.ids.bank_account_id,
      amount: enriched.raw.amount,
      direction: enriched.raw.amount > 0 ? 'inflow' : 'outflow',
      description: enriched.raw.description ?? undefined,
      reference: enriched.normalized.normalized_reference ?? undefined,
      payee: enriched.normalized.contact_name ?? undefined,
      currencyCode: enriched.raw.currency_code,
      metadata: {
        enrichmentVersion: enriched.version,
        contactFingerprint: enriched.normalized.contact_fingerprint,
        contactConfidence: enriched.normalized.contact_match_confidence,
        statsSnapshotChecksum:
          enriched.metadata.stats_snapshot_checksum ?? undefined,
        signals: enriched.signals,
      },
    },
    company: {
      companyId: enriched.ids.company_uuid,
      regionCode: enriched.context.region_code ?? null,
      countryCode: enriched.context.country_code ?? null,
      subregionCode: enriched.context.subregion_code ?? null,
    },
  };
}
