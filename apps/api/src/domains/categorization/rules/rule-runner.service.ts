import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import {
  rulesEngine,
  RulesEngine,
  type RuleEngineResult,
} from './rules.engine.js';
import type { RuleEngineInput } from './rules.engine.types.js';
import { RuleRepository } from './rules.repository.js';
import {
  RuleLogRepository,
  type RuleLogWriter,
} from './rule-logs.repository.js';
import { RuleCompiler } from './rules.compiler.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';
import {
  CandidateRepository,
  type CandidateLineDraft,
} from '../candidates/candidates.repository.js';
import type { CandidateSplitType } from '../candidates/candidates.types.js';
import type { CategorizeLine } from './rules-def.types.js';
import { PredictionRepository } from '../predictions/predictions.repository.js';
import type { CategorizationTaskStatus } from '../tasks/tasks.enums.js';
import { enqueueMLPredictionJob } from '../ml/ml-prediction.queue.js';
import {
  processPredictionToCandidate,
  type ProcessPredictionToCandidateParams,
} from '../processing/prediction-pipeline.service.js';

const CATEGORIZATION_TASKS_TABLE = 'categorization_tasks';

export interface RuleRunnerDependencies {
  runEngine?: (input: RuleEngineInput) => Promise<RuleEngineResult>;
  knex?: Knex;
  candidateRepository?: CandidateRepository;
  predictionRepository?: PredictionRepository;
  ruleRepository?: RuleRepository;
  ruleLogWriter?: RuleLogWriter;
  compiler?: RuleCompiler;
  processPredictionToCandidate?: (
    params: ProcessPredictionToCandidateParams,
  ) => Promise<{
    predictionId: string;
    candidateId?: string;
    violations: unknown[];
    skipped: boolean;
    skipReason?: string;
  }>;
}

export async function runRulesForEnrichedTransaction(
  event: TransactionEnrichedEventData,
  deps: RuleRunnerDependencies = {},
): Promise<void> {
  const runEngine = deps.runEngine ?? ((input) => rulesEngine.run(input));
  const db = deps.knex ?? knexClient;
  let ruleResult: RuleEngineResult | null = null;

  try {
    const input = buildRuleEngineInput(event);

    // If a custom runEngine is provided (tests), keep using it and then
    // persist outcome in a transaction. Otherwise run the engine inside
    // the DB transaction so logs and outcome are atomic.
    if (deps.runEngine) {
      const result = await runEngine(input);
      ruleResult = result;
      await db.transaction(async (trx) => {
        const scopedCandidateRepository =
          deps.candidateRepository ?? new CandidateRepository(trx);
        const scopedPredictionRepository =
          deps.predictionRepository ?? new PredictionRepository(trx);

        // Serialize candidate/prediction writes per task
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
          event.categorization_task_id,
        ]);

        await persistRuleRunOutcome(
          {
            taskId: event.categorization_task_id,
            result,
            enrichedTransaction: event.enriched_transaction,
          },
          trx,
        );
        await persistRulePredictionAndCandidate({
          event,
          result,
          predictionRepository: scopedPredictionRepository,
          candidateRepository: scopedCandidateRepository,
          processPredictionToCandidateFn: deps.processPredictionToCandidate,
          trx,
        });
      });
    } else {
      await db.transaction(async (trx) => {
        const ruleRepo = deps.ruleRepository ?? new RuleRepository(trx);
        const logWriter = deps.ruleLogWriter ?? new RuleLogRepository(trx);
        const compiler = deps.compiler ?? new RuleCompiler();

        const engine = new RulesEngine(ruleRepo, compiler, logWriter);
        const result = await engine.run(input);
        ruleResult = result;

        const scopedCandidateRepository =
          deps.candidateRepository ?? new CandidateRepository(trx);
        const scopedPredictionRepository =
          deps.predictionRepository ?? new PredictionRepository(trx);

        // Serialize candidate/prediction writes per task
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
          event.categorization_task_id,
        ]);

        await persistRuleRunOutcome(
          {
            taskId: event.categorization_task_id,
            result,
            enrichedTransaction: event.enriched_transaction,
          },
          trx,
        );
        await persistRulePredictionAndCandidate({
          event,
          result,
          predictionRepository: scopedPredictionRepository,
          candidateRepository: scopedCandidateRepository,
          processPredictionToCandidateFn: deps.processPredictionToCandidate,
          trx,
        });
      });
    }

    logger.info(
      {
        bankTransactionId: event.bank_transaction_id,
        companyId: event.company_uuid,
      },
      'Rule engine run completed',
    );

    // Check if ML prediction should be enqueued after rule run
    await enqueueMlIfNeeded(event, ruleResult);
  } catch (error) {
    logger.error(
      {
        bankTransactionId: event.bank_transaction_id,
        companyId: event.company_uuid,
        error,
      },
      'Rule engine run failed',
    );
    await persistRuleRunFailure(event.categorization_task_id, error, db);

    // Enqueue ML even on rule failure to get fallback predictions
    await enqueueMlIfNeeded(event, null);

    throw error;
  }
}

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
      amount: enriched.raw.amount_native,
      direction: enriched.raw.direction,
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

async function persistRuleRunOutcome(
  params: {
    taskId: string;
    result: RuleEngineResult;
    enrichedTransaction: EnrichedTransaction;
  },
  knex: Knex,
): Promise<void> {
  const { taskId, result, enrichedTransaction } = params;
  const metadataPatch = {
    last_run_id: result.runId,
    status: result.status,
    needs_review: result.needsReview,
    winning_rule_id: result.winningRuleId ?? null,
    conflicting_field: result.conflictingField ?? null,
    final_state: result.finalState,
    transaction_date: enrichedTransaction.raw.date,
    enriched_version: enrichedTransaction.version,
    updated_at: new Date().toISOString(),
  };

  const nextStatus = mapResultToTaskStatus(result);
  const updatePayload: Record<string, unknown> = {
    metadata: knex.raw(
      `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{rule_engine}', ?::jsonb, true)`,
      JSON.stringify(metadataPatch),
    ),
    updated_at: knex.fn.now(),
  };

  if (nextStatus) {
    updatePayload.status = nextStatus;
  }

  await knex(CATEGORIZATION_TASKS_TABLE)
    .where({ id: taskId })
    .update(updatePayload);
}

async function persistRuleRunFailure(
  taskId: string,
  error: unknown,
  knex: Knex,
): Promise<void> {
  const metadataPatch = {
    status: 'error',
    error_message:
      error instanceof Error ? error.message : 'rule_runner_unknown_error',
    updated_at: new Date().toISOString(),
  };

  await knex(CATEGORIZATION_TASKS_TABLE)
    .where({ id: taskId })
    .update({
      status: 'failed',
      metadata: knex.raw(
        `jsonb_set(COALESCE(metadata, '{}'::jsonb), '{rule_engine}', ?::jsonb, true)`,
        JSON.stringify(metadataPatch),
      ),
      updated_at: knex.fn.now(),
    });
}

function mapResultToTaskStatus(
  result: RuleEngineResult,
): CategorizationTaskStatus | null {
  switch (result.status) {
    case 'applied':
      return 'pending';
    case 'conflict':
    case 'error':
      return 'partial';
    default:
      return null;
  }
}

async function persistRulePredictionAndCandidate(params: {
  event: TransactionEnrichedEventData;
  result: RuleEngineResult;
  predictionRepository: PredictionRepository;
  candidateRepository: CandidateRepository;
  processPredictionToCandidateFn?: (
    params: ProcessPredictionToCandidateParams,
  ) => Promise<{
    predictionId: string;
    candidateId?: string;
    violations: unknown[];
    skipped: boolean;
    skipReason?: string;
  }>;
  trx: Knex;
}): Promise<void> {
  const {
    event,
    result,
    candidateRepository,
    predictionRepository,
    processPredictionToCandidateFn,
    trx,
  } = params;
  const categorizeLines = result.finalState.categorize;
  if (!categorizeLines?.length || result.status !== 'applied') {
    return;
  }

  const transactionAmount = Math.abs(
    event.enriched_transaction.raw.amount_native,
  );
  if (transactionAmount === 0) {
    return;
  }

  const journalLines = buildJournalLines({
    categorizeLines,
    transactionAmount,
    direction: event.enriched_transaction.raw.direction,
    currencyCode: event.enriched_transaction.raw.currency_code,
    bankCoaId: event.enriched_transaction.ids.bank_account_coa_id,
    reportingRatio: deriveReportingRatio(event.enriched_transaction),
  });

  if (journalLines.length === 0) {
    return;
  }

  const explanation = buildCandidateExplanation(result);
  const processFn =
    processPredictionToCandidateFn ?? processPredictionToCandidate;
  await processFn({
    categorizationTaskId: event.categorization_task_id,
    bankTransactionId: event.bank_transaction_id,
    bankTransactionDate: event.enriched_transaction.raw.date,
    companyId: event.company_uuid,
    source: 'rule',
    lines: journalLines,
    confidence: 1,
    rank: 1,
    isPrimary: true,
    modelVersion: null,
    predictionGroupId: null,
    explanation,
    metadata: {
      run_id: result.runId,
      rule_id: result.winningRuleId,
      provenance: 'rule_engine',
    },
    enrichedTransaction: event.enriched_transaction,
    predictionRepository,
    candidateRepository,
    knex: trx,
    softDeleteExistingPredictions: false,
  });
}

function buildCandidateExplanation(
  result: RuleEngineResult,
): Record<string, unknown> | null {
  if (!result.logs.length) {
    return null;
  }
  const winning = result.logs.find(
    (log) => log.ruleId === result.winningRuleId,
  );
  if (!winning) {
    return null;
  }
  return {
    rule_id: winning.ruleId,
    matched_conditions: winning.matchedConditions ?? [],
    applied_actions: winning.appliedActions ?? [],
  };
}

function deriveReportingRatio(enriched: EnrichedTransaction): number {
  const native = Math.abs(enriched.raw.amount_native);
  const reporting = Math.abs(enriched.raw.amount_reporting ?? 0);
  if (!native || !reporting) {
    return 1;
  }
  return reporting / native;
}

function buildJournalLines(params: {
  categorizeLines: CategorizeLine[];
  transactionAmount: number;
  direction: 'inflow' | 'outflow' | 'transfer';
  currencyCode: string;
  bankCoaId: string | null;
  reportingRatio: number;
}): CandidateLineDraft[] {
  const {
    categorizeLines,
    transactionAmount,
    direction,
    currencyCode,
    bankCoaId,
    reportingRatio,
  } = params;
  if (!bankCoaId) {
    return [];
  }

  const computed = computeCategorizeAmounts(categorizeLines, transactionAmount);
  if (!computed.length) {
    return [];
  }

  const counterpartEntryType = direction === 'inflow' ? 'credit' : 'debit';
  const bankEntryType = direction === 'inflow' ? 'debit' : 'credit';

  const lines: CandidateLineDraft[] = [];
  lines.push({
    entryType: bankEntryType,
    coaId: bankCoaId,
    amountNative: toCurrency(transactionAmount),
    amountReporting: toCurrency(transactionAmount * reportingRatio),
    currencyCode,
    description: 'Bank leg',
    isBankLeg: true,
    splitType: 'bank',
    metadata: { direction },
  });

  for (const item of computed) {
    if (!item.line.coa_id) {
      continue;
    }
    lines.push({
      entryType: counterpartEntryType,
      coaId: item.line.coa_id,
      amountNative: toCurrency(item.amount),
      amountReporting: toCurrency(item.amount * reportingRatio),
      currencyCode,
      description: item.line.description ?? null,
      isBankLeg: false,
      splitType: item.line.split_type as CandidateSplitType,
      splitValue: getSplitValue(item.line),
      metadata: item.line as unknown as Record<string, unknown>,
    });
  }

  return lines;
}

function computeCategorizeAmounts(
  lines: CategorizeLine[],
  totalAmount: number,
): Array<{ line: CategorizeLine; amount: number }> {
  const sanitizedTotal = Math.abs(totalAmount);
  if (sanitizedTotal === 0) {
    return [];
  }

  const nonRemainder: Array<{ line: CategorizeLine; amount: number }> = [];
  let remainderLine: CategorizeLine | undefined;

  for (const line of lines) {
    if (line.split_type === 'remainder') {
      remainderLine = line;
      continue;
    }
    let amount = 0;
    if (line.split_type === 'amount') {
      amount = line.value;
    } else if (line.split_type === 'percentage') {
      amount = sanitizedTotal * line.value;
    }
    nonRemainder.push({ line, amount });
  }

  const roundedNonRemainder = nonRemainder.map((item) => ({
    line: item.line,
    amount: toCurrency(item.amount),
  }));
  const computed = [...roundedNonRemainder];
  const roundedSum = computed.reduce((sum, item) => sum + item.amount, 0);

  if (remainderLine) {
    const remainderAmount = toCurrency(
      Math.max(sanitizedTotal - roundedSum, 0),
    );
    computed.push({ line: remainderLine, amount: remainderAmount });
  } else if (computed.length > 0) {
    const diff = toCurrency(sanitizedTotal - roundedSum);
    if (Math.abs(diff) >= 0.01) {
      const last = computed[computed.length - 1];
      last.amount = toCurrency(Math.max(last.amount + diff, 0));
    }
  }

  return computed.filter((item) => item.amount > 0);
}

function toCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSplitValue(line: CategorizeLine): number | null {
  if ('value' in line && typeof line.value === 'number') {
    return line.value;
  }
  return null;
}

/**
 * Determine if ML prediction should be enqueued based on:
 * 1. Shadow mode (processing_context === 'shadow') - always run ML
 * 2. Rule failure or no match - run ML as fallback
 * 3. Rule conflict - run ML for alternative suggestions
 *
 * @param event - Transaction enriched event data
 * @param ruleResult - Result from rule engine (null if rules failed)
 */
async function enqueueMlIfNeeded(
  event: TransactionEnrichedEventData,
  ruleResult: RuleEngineResult | null,
): Promise<void> {
  try {
    const enrichedTxn = event.enriched_transaction;
    const processingContext = enrichedTxn.metadata.processing_context;

    // Check if we should run ML
    const shouldRunML = shouldEnqueueML(processingContext, ruleResult);

    if (!shouldRunML) {
      logger.debug(
        {
          bankTransactionId: event.bank_transaction_id,
          processingContext,
          ruleStatus: ruleResult?.status,
        },
        'Skipping ML prediction - rules applied successfully',
      );
      return;
    }

    logger.info(
      {
        bankTransactionId: event.bank_transaction_id,
        processingContext,
        ruleStatus: ruleResult?.status ?? 'error',
      },
      'Enqueueing ML prediction job',
    );

    // Enqueue ML prediction job
    await enqueueMLPredictionJob({
      categorizationTaskId: event.categorization_task_id,
      bankTransactionId: event.bank_transaction_id,
      companyId: event.company_uuid,
      enrichedTransaction: enrichedTxn,
    });

    logger.debug(
      {
        bankTransactionId: event.bank_transaction_id,
        categorizationTaskId: event.categorization_task_id,
      },
      'ML prediction job enqueued successfully',
    );
  } catch (error) {
    // Log error but don't throw - ML is optional enhancement
    logger.error(
      {
        bankTransactionId: event.bank_transaction_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to enqueue ML prediction job',
    );
  }
}

/**
 * Determine if ML should run based on processing context and rule result
 *
 * @param processingContext - 'shadow' or 'primary' from enrichment metadata
 * @param ruleResult - Result from rule engine execution
 * @returns true if ML should be enqueued
 */
function shouldEnqueueML(
  processingContext: 'shadow' | 'primary' | undefined,
  ruleResult: RuleEngineResult | null,
): boolean {
  // Shadow mode: always run ML for training/validation
  if (processingContext === 'shadow') {
    return true;
  }

  // Primary mode: run ML only if rules didn't resolve successfully
  if (processingContext === 'primary') {
    // Rules failed to execute
    if (ruleResult === null) {
      return true;
    }

    // Rules executed but didn't match anything
    if (ruleResult.status === 'no_match') {
      return true;
    }

    // Rules had an error during execution
    if (ruleResult.status === 'error') {
      return true;
    }

    // Rules had conflicts between multiple matching rules
    if (ruleResult.status === 'conflict') {
      return true;
    }

    // Rules applied successfully - no need for ML
    if (ruleResult.status === 'applied') {
      return false;
    }
  }

  // Default: run ML if processing context is undefined (safety fallback)
  return true;
}
