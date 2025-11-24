import type { Knex } from 'knex';
import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import { rulesEngine, type RuleEngineResult } from './rules.engine.js';
import type { RuleEngineInput } from './rules.engine.types.js';
import type { EnrichedTransaction } from '../enrichment/enrichment.types.js';
import {
  CandidateRepository,
  type CandidateLineDraft,
} from '../candidates/candidates.repository.js';
import type { CandidateSplitType } from '../candidates/candidates.types.js';
import type { CategorizeLine } from './rules-def.types.js';
import {
  PredictionRepository,
  type PredictionLineDraft,
} from '../predictions/predictions.repository.js';
import type { CategorizationTaskStatus } from '../tasks/tasks.enums.js';

const CATEGORIZATION_TASKS_TABLE = 'categorization_tasks';

export interface RuleRunnerDependencies {
  runEngine?: (input: RuleEngineInput) => Promise<RuleEngineResult>;
  knex?: Knex;
  candidateRepository?: CandidateRepository;
  predictionRepository?: PredictionRepository;
}

export async function runRulesForEnrichedTransaction(
  event: TransactionEnrichedEventData,
  deps: RuleRunnerDependencies = {},
): Promise<void> {
  const runEngine = deps.runEngine ?? ((input) => rulesEngine.run(input));
  const db = deps.knex ?? knexClient;
  try {
    const input = buildRuleEngineInput(event);
    const result = await runEngine(input);
    await db.transaction(async (trx) => {
      const scopedCandidateRepository =
        deps.candidateRepository ?? new CandidateRepository(trx);
      const scopedPredictionRepository =
        deps.predictionRepository ?? new PredictionRepository(trx);

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
      });
    });
    logger.info(
      {
        bankTransactionId: event.bank_transaction_id,
        companyId: event.company_uuid,
        status: result.status,
        needsReview: result.needsReview,
      },
      'Rule engine run completed',
    );
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
}): Promise<void> {
  const { event, result, candidateRepository, predictionRepository } = params;
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
  await predictionRepository.softDeleteByTask({
    categorizationTaskId: event.categorization_task_id,
    source: 'rule',
  });

  const predictionId = await predictionRepository.createPredictionWithLines({
    categorizationTaskId: event.categorization_task_id,
    bankTransactionId: event.bank_transaction_id,
    bankTransactionDate: event.enriched_transaction.raw.date,
    companyId: event.company_uuid,
    source: 'rule',
    rank: 1,
    isPrimary: true,
    confidence: 1,
    modelVersion: null,
    predictionGroupId: null,
    status: 'pending',
    inputChecksum: null,
    explanation,
    metadata: {
      run_id: result.runId,
      rule_id: result.winningRuleId,
    },
    lines: toPredictionLines(journalLines),
  });

  await candidateRepository.softDeleteByTask({
    categorizationTaskId: event.categorization_task_id,
  });

  await candidateRepository.createCandidateWithLines({
    predictionId,
    categorizationTaskId: event.categorization_task_id,
    bankTransactionId: event.bank_transaction_id,
    bankTransactionDate: event.enriched_transaction.raw.date,
    companyId: event.company_uuid,
    status: 'proposed',
    confidence: 1,
    contactId: event.enriched_transaction.ids.contact_id ?? null,
    description: event.enriched_transaction.raw.description ?? null,
    reference:
      event.enriched_transaction.normalized.normalized_reference ?? null,
    solverNotes: 'rule_engine_auto',
    metadata: { provenance: 'rule_engine' },
    lines: journalLines,
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
    lineRank: 0,
    entryType: bankEntryType,
    coaId: bankCoaId,
    amountNative: toCurrency(transactionAmount),
    amountReporting: toCurrency(transactionAmount * reportingRatio),
    currencyCode,
    description: 'Bank leg',
    splitType: 'bank',
    metadata: { direction },
  });

  let rank = 1;
  for (const item of computed) {
    if (!item.line.coa_id) {
      continue;
    }
    lines.push({
      lineRank: rank++,
      entryType: counterpartEntryType,
      coaId: item.line.coa_id,
      amountNative: toCurrency(item.amount),
      amountReporting: toCurrency(item.amount * reportingRatio),
      currencyCode,
      description: item.line.description ?? null,
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

function toPredictionLines(lines: CandidateLineDraft[]): PredictionLineDraft[] {
  return lines.map((line) => ({
    lineRank: line.lineRank,
    entryType: line.entryType,
    coaId: line.coaId,
    projectId: line.projectId ?? null,
    amountNative: line.amountNative,
    amountReporting: line.amountReporting ?? null,
    currencyCode: line.currencyCode,
    description: line.description ?? null,
    splitType: line.splitType,
    splitValue: line.splitValue ?? null,
    metadata: line.metadata ?? null,
  }));
}
