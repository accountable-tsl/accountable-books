import type { AccrualResolverOutput } from '@accountable-books/contracts/schema';
import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { logger, toYMD } from '../../../shared/index.js';
import {
  acquireAdvisoryXactLocks,
  lockKeyCategorizationTask,
  lockKeyCompany,
} from '../../../shared/services/advisoryLocks.service.js';
import {
  ACTIVITY_EVENT_TYPE,
  writeActivityEventIntent,
} from '../../activity/index.js';
import { runConstraints } from '../../constraints/constraint-runner.js';
import { createLedgerRecord } from '../../ledgers/ledgers.model.js';
import { getSystemUser } from '../../users/users.model.js';
import { scheduleOutboxDispatchKickAfterCommit } from '../../work/outbox.queue.js';
import { writeBankAccountWorkMaterializationIntent } from '../../work/work-materialization-intent.js';
import {
  checkAutopostEligibility,
  enqueueDelayedAutopost,
  postCandidateToLedger,
} from '../autopost/index.js';
import { persistCategorizationCandidate } from '../candidates/candidates.service.js';
// Contact resolution retired (v1): import disabled, caller commented out below.
// import { updateBankTransactionContactResolution } from '../contact-resolution-updates.service.js';
import { enqueueMLPredictionJob } from '../ml/ml-prediction.queue.js';
import { logTaskEventSafe } from '../tasks/task-events.service.js';
import {
  allEqual,
  buildExplanationFromRuleResult,
  computeCategorizeAmounts,
} from './post-prediction.helpers.js';
import { persistPrediction } from './predictions/predictions.service.js';

import type { CandidateLineDraft } from '../candidates/candidates.types.js';
import type { TxnCategorizationSource } from '../categorization.types.js';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import type { MLPredictionOutput } from '../ml/ml-prediction.types.js';
import type { RuleEngineResult } from '../rules/rules.engine.types.js';
import type { TaskEventType } from '../tasks/index.js';
import type {
  HandlePostPredictionParams,
  HandleRulePredictionParams,
} from './post-prediction.types.js';
import type {
  MLPredictionMetadata,
  PersistPredictionParams,
  RulePredictionMetadata,
} from './predictions/predictions.types.js';

// Map status to specific event type
const eventTypeMap: Record<RuleEngineResult['status'], TaskEventType> = {
  applied: 'rules_applied',
  no_match: 'rules_no_match',
  conflict: 'rules_conflict',
  error: 'rules_error', // Rule evaluation error (different from exception)
};

/**
 * Main entry point for post-prediction processing
 * Routes to appropriate handler based on source (rule or ml)
 *
 * Note: This function is called inside a transaction for DB operations.
 * ML enqueueing happens after the transaction commits (scheduled via setImmediate).
 */
export async function handlePostPrediction(
  params: HandlePostPredictionParams,
): Promise<void> {
  let predictionData: PersistPredictionParams | null = null;
  let accrualOutput: AccrualResolverOutput | null = null;

  if (params.source === 'rule') {
    predictionData = await handleRulePrediction({
      event: params.event,
      ruleResult: params.ruleResult,
      source: params.source,
      runId: params.runId,
      error: params.error,
      trx: params.trx,
    });
  }

  if (params.source === 'ml' || params.source === 'ml_heuristic') {
    accrualOutput = params.mlResult.accrual_resolver ?? null;

    // Build prediction with accrual logic applied (if applicable)
    // This ensures prediction reflects accrual account, not just candidate
    predictionData = buildPredictionFromMlOutput({
      event: params.event,
      mlResult: params.mlResult,
      source: params.source,
      runId: params.runId,
      accrualOutput, // Pass accrual output to apply in prediction
    });
  }

  if (predictionData) {
    // Step 1: Persist prediction in separate transaction (always succeeds, even if validation fails)
    const predictionId = await persistPredictionOnly(predictionData);

    // Step 2: Validate and create candidate in transaction
    // If this fails, prediction is still persisted (for auditability)
    await processPredictionToCandidate({
      source: params.source,
      event: params.event,
      predictionData,
      runId: params.runId,
      predictionId,
      trx: params.trx,
    });

    // Calculate post-prediction processing latency
    // const postPredictionLatencyMs = Date.now() - postPredictionStartTime;
  }
}

/**
 * Handle post-rules processing: update task, create predictions/candidates
 * Internal function - use handlePostPrediction instead
 */
async function handleRulePrediction(
  params: HandleRulePredictionParams,
): Promise<PersistPredictionParams | null> {
  const { event, ruleResult, runId, error, rulesLatencyMs, trx } = params;

  // Serialize candidate/prediction writes per task
  await acquireAdvisoryXactLocks(trx, [lockKeyCompany(event.company_uuid)]);
  await acquireAdvisoryXactLocks(trx, [
    lockKeyCategorizationTask(event.categorization_task_id),
  ]);

  // Handle exception case (rules engine failed to complete)
  if (error || !ruleResult) {
    await logTaskEventSafe({
      categorization_task_id: event.categorization_task_id,
      run_id: runId,
      event_stage: 'rule_engine',
      event_type: 'rules_failed', // Exception before completion
      event_timestamp: new Date(),
      metadata: {
        error_message:
          error instanceof Error ? error.message : 'rule_runner_unknown_error',
        ...(rulesLatencyMs !== undefined ? { latency_ms: rulesLatencyMs } : {}),
      },
      trx,
    });

    return null;
  }

  await logTaskEventSafe({
    categorization_task_id: event.categorization_task_id,
    run_id: runId,
    event_stage: 'rule_engine',
    event_type: eventTypeMap[ruleResult.status],
    event_timestamp: new Date(),
    metadata: {
      status: ruleResult.status,
      applied_rule_ids: ruleResult.appliedRuleIds,
      ...(rulesLatencyMs !== undefined ? { latency_ms: rulesLatencyMs } : {}),
    },
    trx,
  });

  // If rules applied successfully, create prediction and candidate
  if (ruleResult.status === 'applied') {
    // Build prediction data
    const predictionData = buildPredictionFromRuleResult(
      event,
      ruleResult,
      runId,
    );

    return predictionData;

    // await processPredictionsToCandidates({
    //   source: 'rule',
    //   event,
    //   runId,
    //   predictionData,
    //   trx,
    // });
  }

  return null;
}

/**
 * Determine if ML should run based on processing context and rule result
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
  // To return to false later
  return true;
}

/**
 * Determine if ML prediction should be enqueued and enqueue if needed
 * Note: ML enqueueing happens after transaction commits to avoid blocking
 */
export async function enqueueMlIfNeeded({
  event,
  ruleResult,
}: {
  event: TransactionEnrichedEventData;
  ruleResult: RuleEngineResult | null;
}): Promise<void> {
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

    // Enqueue ML prediction job (after transaction commits)
    await enqueueMLPredictionJob({
      categorizationTaskId: event.categorization_task_id,
      bankTransactionId: event.bank_transaction_id,
      companyId: event.company_uuid,
      enrichedTransaction: enrichedTxn,
      runId: event.run_id,
    });

    await logTaskEventSafe({
      categorization_task_id: event.categorization_task_id,
      run_id: event.run_id,
      event_stage: 'ml_engine',
      event_type: 'ml_enqueued',
      event_timestamp: new Date(),
      metadata: {
        processing_context: enrichedTxn.metadata.processing_context,
      },
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
 * Builds prediction object from rule result.
 *
 * Design Decision: Predictions do NOT include bank legs.
 * - Predictions represent what the rule/ML engine decided (the categorization)
 * - Bank legs are added later when building candidates (complete journal entries)
 * - This separation allows us to audit what the engine predicted vs. the final journal entry
 *
 * @param event - Enriched transaction event data
 * @param result - Rule engine result with final state
 * @returns Prediction data ready for persistence
 */
function buildPredictionFromRuleResult(
  event: TransactionEnrichedEventData,
  result: RuleEngineResult,
  runId: string,
): PersistPredictionParams {
  // Rules engine final state fields
  const description = result.finalState.description; // Means rule has resolved to set this description
  const contactId = result.finalState.contact; // Means rule has resolved to set this contact etc
  const contactType = result.finalState.contact_type;
  const reference = result.finalState.reference;
  const ledgerDate = result.finalState.ledger_date;
  const categorizeLines = result.finalState.categorize;

  if (!categorizeLines || categorizeLines?.length === 0) {
    throw new Error('Cannot build prediction: no categorize lines found');
  }

  // Get all applied rule logs for metadata
  const appliedRuleLogs = result.logs.filter(
    (log) =>
      log.status === 'success' && result.appliedRuleIds.includes(log.ruleId),
  );

  if (appliedRuleLogs.length === 0) {
    throw new Error(
      'Cannot create rule prediction metadata: no applied rules found',
    );
  }

  // Build transaction-level explanation
  const explanation = buildExplanationFromRuleResult(result);

  const transactionAmount = event.enriched_transaction.raw.amount;
  const computedLines = computeCategorizeAmounts(
    categorizeLines,
    transactionAmount,
  );

  if (computedLines.length === 0) {
    throw new Error('Cannot create prediction: no categorize lines generated');
    // or return some fallback, but API requires at least one
  }

  const predictionLines: PersistPredictionParams['predictionLines'] =
    computedLines.map((l) => {
      // remainder lines have no .value
      const hasValue =
        l.split_type === 'amount' || l.split_type === 'percentage';

      return {
        coa_id: l.coa_id,
        signed_native_amount: l.amount,
        description: l.description,
        is_bank_leg: false,
        split_type: l.split_type,
        ...(hasValue && 'value' in l && l.value != null
          ? { split_value: l.value }
          : {}),
        ...(explanation ? { explanation } : {}),
        // metadata
      };
    });

  // Build metadata
  const metadata: RulePredictionMetadata = {
    provenance: 'rule_engine',
    run_id: runId,
    rule_ids: result.appliedRuleIds,
    rules: appliedRuleLogs.map((log) => ({
      rule_id: log.ruleId,
      ...(log.ruleName ? { rule_name: log.ruleName } : {}),
      ...(log.matchedConditions || log.appliedActions
        ? {
            rule_details: {
              matched_conditions: log.matchedConditions ?? [],
              applied_actions: log.appliedActions ?? [],
            },
          }
        : {}),
    })),
  };

  // Type assertion: we've checked that computed.length > 0, so predictionLines is non-empty
  const [firstLine, ...restLines] = predictionLines;

  return {
    prediction: {
      categorization_task_id: event.categorization_task_id,
      bank_transaction_id: event.bank_transaction_id,
      bank_transaction_date: event.enriched_transaction.raw.date,
      run_id: runId,
      company_id: event.company_uuid,
      source: 'rule',
      ...(contactId ? { contact_id: contactId } : {}),
      ...(contactType ? { contact_type: contactType } : {}),
      ...(description ? { description } : {}),
      ...(reference ? { reference } : {}),
      ...(ledgerDate ? { ledger_date: toYMD(ledgerDate) } : {}),
      confidence: 1,
      model_version: null,
      explanation,
      metadata,
    },
    predictionLines: [firstLine, ...restLines],
  };
}

function buildPredictionFromMlOutput({
  event,
  mlResult,
  source,
  runId,
  accrualOutput,
}: {
  event: TransactionEnrichedEventData;
  mlResult: MLPredictionOutput;
  source: 'ml' | 'ml_heuristic';
  runId: string;
  accrualOutput?: AccrualResolverOutput | null;
}): PersistPredictionParams {
  // Note: ML output structure is validated using Zod schema in ml-prediction.service.ts
  // before this function is called, so we can assume valid input here

  const { global_intent_classifier, tenant_account_ranker, final_posting } =
    mlResult;

  // Check if accrual should be applied BEFORE building prediction lines
  // This ensures the prediction itself reflects the accrual account, not just the candidate
  const enrichedTxn = event.enriched_transaction;
  const shouldUseAccrual =
    accrualOutput?.should_accrue === true &&
    enrichedTxn.context.accounting_basis === 'modified_accrual_basis' &&
    accrualOutput.top_1_recommendation !== null;

  // Use accrual account if applicable, otherwise use original prediction account
  const accountId = shouldUseAccrual
    ? accrualOutput.top_1_recommendation!.account_id
    : final_posting.account_id;

  // Store original account in metadata for audit trail
  const originalAccountId = final_posting.account_id;

  const transactionAmount = enrichedTxn.raw.amount;
  const counterpartAmount = -transactionAmount;

  const contactTypeValue =
    enrichedTxn.normalized.contact_type &&
    enrichedTxn.normalized.contact_type !== 'unknown'
      ? enrichedTxn.normalized.contact_type
      : null;

  /**
   * Design Decision: ML Output Field Sources
   *
   * - Confidence: Model A (global_intent_classifier.semantic_top1_prob) - calibrated probability
   * - Model Version: Model A (global_intent_classifier.model_version)
   * - Explanation: Model B (tenant_account_ranker.explanation.message)
   *
   * Model B's selected_account_score is NOT used for confidence because it is a ranking score,
   * not a calibrated probability. Ranking scores are relative and not directly interpretable
   * as probabilities.
   *
   * Note: All structure and value validation happens in ml-prediction.service.ts via Zod schema.
   */

  const confidence = global_intent_classifier.semantic_top1_prob;
  const explanation =
    tenant_account_ranker.explanation.message ?? 'This is just a guess';
  const modelVersion: string = String(global_intent_classifier.model_version);

  const metadata: MLPredictionMetadata = {
    provenance: 'ml_engine',
    global_intent_classifier: mlResult.global_intent_classifier,
    tenant_account_ranker: mlResult.tenant_account_ranker,
    final_posting: mlResult.final_posting,
    explanation: tenant_account_ranker.explanation,
    ...(mlResult.accrual_resolver
      ? { accrual_resolver: mlResult.accrual_resolver }
      : {}),
  };

  return {
    prediction: {
      categorization_task_id: event.categorization_task_id,
      bank_transaction_id: event.bank_transaction_id,
      bank_transaction_date: enrichedTxn.raw.date,
      run_id: runId,
      company_id: event.company_uuid,
      source,
      contact_id: enrichedTxn.ids.contact_id ?? null,
      ...(contactTypeValue ? { contact_type: contactTypeValue } : {}),
      description: enrichedTxn.raw.description ?? null,
      reference: enrichedTxn.raw.reference ?? null,
      ledger_date: enrichedTxn.raw.date,
      confidence,
      model_version: modelVersion,
      explanation,
      metadata,
    },
    // Only one prediction line for now
    // Use accrual account label if accrual was applied, otherwise use original
    predictionLines: (() => {
      const accountLabel = shouldUseAccrual
        ? (accrualOutput?.top_1_recommendation?.account_label ??
          mlResult.final_posting.account_label)
        : mlResult.final_posting.account_label;

      return [
        {
          coa_id: accountId,
          signed_native_amount: counterpartAmount,
          description: accountLabel ?? enrichedTxn.raw.description ?? null,
          is_bank_leg: false,
          metadata: {
            account_label: accountLabel,
            ...(shouldUseAccrual
              ? {
                  accrual_applied: true,
                  original_account_id: originalAccountId,
                  original_account_label: mlResult.final_posting.account_label,
                }
              : {}),
          },
        },
      ];
    })(),
  };
}

/**
 * Persist prediction in a separate transaction.
 * This ensures predictions are stored even if constraint validation fails later.
 *
 * Design Decision: Predictions are persisted in a separate transaction BEFORE constraint validation.
 * - This ensures we have an audit trail of what rules/ML returned, even if validation fails
 * - Invalid predictions are still stored for debugging and analysis
 * - This is separate from candidate creation to prevent rollback of predictions
 */
async function persistPredictionOnly(
  predictionData: PersistPredictionParams,
): Promise<string> {
  return await knexClient.transaction(async (trx) => {
    logger.debug(
      {
        bankTransactionId: predictionData.prediction.bank_transaction_id,
        categorizationTaskId: predictionData.prediction.categorization_task_id,
        source: predictionData.prediction.source,
        predictionLinesCount: predictionData.predictionLines.length,
      },
      'Persisting prediction in separate transaction',
    );
    return await persistPrediction(predictionData, trx);
  });
}

/**
 * Process prediction to candidate: validate, build journal entries, run constraints, persist.
 *
 * Design Decision: Constraints are validated AFTER persisting predictions (in separate transaction).
 * - Predictions are already persisted (via persistPredictionOnly)
 * - This function validates and creates candidates
 * - If constraint validation fails, prediction is still persisted (for auditability)
 *
 * Flow:
 * - Validate company/bank transaction IDs match across all sources
 * - Fetch bank transaction and validate it exists and belongs to company
 * - Validate all predicted COA IDs exist, are active, and belong to company
 * - Build bank leg (counterpart to the prediction lines)
 * - Build complete journal entry (bank leg + prediction lines)
 * - Run constraint validation on complete journal entry
 * - If valid, persist candidate; if invalid, log event and throw error
 *
 * @param source - Source of prediction (rule, ml, ml_heuristic)
 * @param event - Enriched transaction event data
 * @param runId - Run ID for tracking this categorization attempt
 * @param predictionData - Prediction data from rule/ML engine (without bank leg)
 * @param predictionId - ID of already-persisted prediction
 * @param trx - Database transaction (must already be in transaction with advisory lock)
 */
async function processPredictionToCandidate({
  source,
  event,
  predictionData,
  runId,
  predictionId,
  trx,
}: {
  source: TxnCategorizationSource;
  event: TransactionEnrichedEventData;
  runId: string;
  predictionData: PersistPredictionParams;
  predictionId: string;
  trx?: Knex.Transaction;
}) {
  // Validate data consistency across all sources
  // This ensures we're working with consistent data before proceeding

  const enrichedTransaction = event.enriched_transaction;
  const { prediction: p, predictionLines } = predictionData;

  const companyUUID = event.company_uuid;
  const companyIdFromEnrichedTxn = enrichedTransaction.ids.company_uuid;
  const companyIdFromPrediction = p.company_id;

  if (
    !allEqual(companyUUID, companyIdFromEnrichedTxn, companyIdFromPrediction)
  ) {
    logger.error(
      {
        companyUUID,
        companyIdFromEnrichedTxn,
        companyIdFromPrediction,
        bankTransactionId: event.bank_transaction_id,
        categorizationTaskId: event.categorization_task_id,
      },
      'Company UUID mismatch between event, enriched transaction, and prediction',
    );
    throw new Error(
      `Company UUID mismatch: event=${companyUUID}, enriched=${companyIdFromEnrichedTxn}, prediction=${companyIdFromPrediction}`,
    );
  }

  const bankTxnId = event.bank_transaction_id;
  const bankTxnIdFromEnrichedTxn = enrichedTransaction.ids.bank_transaction_id;
  const bankTxnIdFromPrediction = p.bank_transaction_id;

  if (!allEqual(bankTxnId, bankTxnIdFromEnrichedTxn, bankTxnIdFromPrediction)) {
    logger.error(
      {
        bankTxnId,
        bankTxnIdFromEnrichedTxn,
        bankTxnIdFromPrediction,
        companyUUID,
        categorizationTaskId: event.categorization_task_id,
      },
      'Bank transaction ID mismatch between event, enriched transaction, and prediction',
    );
    throw new Error(
      `Bank transaction ID mismatch: event=${bankTxnId}, enriched=${bankTxnIdFromEnrichedTxn}, prediction=${bankTxnIdFromPrediction}`,
    );
  }

  const bankTxnDate = enrichedTransaction.raw.date;

  const exec = async (txn: Knex.Transaction) => {
    await acquireAdvisoryXactLocks(txn, [lockKeyCompany(companyUUID)]);

    // Serialize candidate writes per task to prevent race conditions
    // This ensures only one candidate is processed at a time for a given task
    // Critical for ML path where multiple jobs might be enqueued concurrently
    await acquireAdvisoryXactLocks(txn, [
      lockKeyCategorizationTask(event.categorization_task_id),
    ]);

    // Prediction is already persisted (via persistPredictionOnly)
    // Now we validate and create candidate

    // Does this transaction belong to the said company?
    const bankTxn = await txn('bank_transactions as bt')
      .select([
        'bt.*',
        'ba.coa_id as bank_coa_id',
        'ba.currency_id as bank_account_currency_id',
      ])
      .where({
        'bt.id': bankTxnId,
        'bt.transaction_date': bankTxnDate,
        'bt.company_id': companyUUID,
        'bt.is_deleted': false,
      })
      .join('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
      .first();

    const bankAccountCoaId = bankTxn?.bank_coa_id;
    const bankAccountCurrencyId = bankTxn?.bank_account_currency_id;
    const bankTransactionAmount = bankTxn?.amount;
    if (
      !bankTxn ||
      !bankAccountCoaId ||
      bankAccountCoaId !== enrichedTransaction.ids.bank_account_coa_id ||
      !bankAccountCurrencyId
    ) {
      // If this ever happens, something is fundamentally wrong
      logger.error(
        {
          bankTransactionId: bankTxnId,
          bankTransactionDate: bankTxnDate,
          companyUUID,
          bankTxnFound: !!bankTxn,
          bankAccountCoaId,
          expectedBankCoaId: enrichedTransaction.ids.bank_account_coa_id,
          bankAccountCurrencyId,
          categorizationTaskId: event.categorization_task_id,
        },
        'Bank transaction validation failed: transaction not found, missing COA, or COA mismatch',
      );
      throw new Error(
        `Bank transaction validation failed for transaction ${bankTxnId}: ` +
          `transaction=${!!bankTxn}, coaId=${bankAccountCoaId}, ` +
          `expectedCoaId=${enrichedTransaction.ids.bank_account_coa_id}, currencyId=${!!bankAccountCurrencyId}`,
      );
    }

    // Validate all predicted COA IDs exist, are active, and belong to company
    // This prevents creating candidates with invalid account references
    const predictedCoaIds = predictionLines.map((p) => p.coa_id);
    const coaIdsToFetch = Array.from(
      new Set([...predictedCoaIds, bankAccountCoaId]),
    );
    const coas = await txn('coa')
      .whereIn('id', coaIdsToFetch)
      .where('company_id', companyUUID)
      .where('is_deleted', false)
      .where('is_active', true)
      .select('id', 'name');
    const coaNameById = new Map(coas.map((coa) => [String(coa.id), coa.name]));

    const foundCoaIds = coas.map((c) => c.id);
    const missingCoaIds = predictedCoaIds.filter(
      (id) => !foundCoaIds.includes(id),
    );
    if (missingCoaIds.length > 0) {
      logger.error(
        {
          companyUUID,
          bankTransactionId: bankTxnId,
          predictedCoaIds,
          foundCoaIds,
          missingCoaIds,
          expectedCount: predictedCoaIds.length,
          foundCount: coas.length,
          categorizationTaskId: event.categorization_task_id,
        },
        'COA validation failed: some predicted COA IDs do not exist, are inactive, or belong to a different company',
      );
      throw new Error(
        `COA validation failed: ${missingCoaIds.length} of ${predictedCoaIds.length} COA IDs are invalid. ` +
          `Missing/invalid COA IDs: ${missingCoaIds.join(', ')}`,
      );
    }

    const projectIds = Array.from(
      new Set(
        predictionLines
          .map((line) => line.project_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const projects = projectIds.length
      ? await txn('projects')
          .whereIn('id', projectIds)
          .where('company_id', companyUUID)
          .where('is_deleted', false)
          .select('id', 'name')
      : [];
    const projectNameById = new Map(
      projects.map((project) => [String(project.id), project.name]),
    );

    const contactIds = Array.from(
      new Set([p.contact_id].filter((id): id is string => Boolean(id))),
    );
    const contacts = contactIds.length
      ? await txn('contacts')
          .whereIn('id', contactIds)
          .where('company_id', companyUUID)
          .where('status', 'active')
          .where('is_deleted', false)
          .select('id', 'display_name')
      : [];
    const contactNameById = new Map(
      contacts.map((contact) => [String(contact.id), contact.display_name]),
    );

    // Build bank leg (counterpart to prediction lines)
    // Bank leg represents the bank account side of the transaction
    // Note: Bank leg is NOT in predictions, only added here for complete journal entry
    logger.debug(
      {
        bankTransactionId: bankTxnId,
        bankAccountCoaId,
        bankTransactionAmount: bankTxn.amount,
      },
      'Building bank leg for candidate',
    );
    const bankLegContactId = p.contact_id ?? null;
    const bankLeg: CandidateLineDraft = {
      fs_date: p.ledger_date ?? bankTxn.transaction_date,
      transaction_side: bankTxn.amount > 0 ? 'debit' : 'credit',
      coa_id: bankAccountCoaId,
      coa_name: coaNameById.get(bankAccountCoaId) ?? null,
      contact_id: bankLegContactId,
      contact_type: p.contact_type ?? null,
      contact_name: bankLegContactId
        ? (contactNameById.get(bankLegContactId) ?? null)
        : null,
      source_currency_id: bankAccountCurrencyId,
      system_exchange_rate: bankTxn.system_exchange_rate,
      custom_exchange_rate: bankTxn.system_exchange_rate,
      signed_native_amount: bankTxn.amount,
      description: p.description ?? bankTxn.description,
      is_bank_leg: true,
      explanation: 'Represents the bank account side of the double-entry',
    };

    // Build other journal entries from prediction lines
    // These represent what the rule/ML engine categorized the transaction as
    // Note: Accrual logic is now applied in buildPredictionFromMlOutput, so prediction lines
    // already reflect the accrual account if applicable
    const otherEntries: CandidateLineDraft[] = predictionLines
      .filter((l) => !l.is_bank_leg)
      .map((l) => {
        const lineContactId = l.contact_id ?? null;
        return {
          fs_date: p.ledger_date ?? bankTxn.transaction_date,
          status: 'proposed',
          transaction_side: l.signed_native_amount > 0 ? 'debit' : 'credit',
          coa_id: l.coa_id,
          project_id: l.project_id,
          coa_name: coaNameById.get(l.coa_id) ?? null,
          project_name: l.project_id
            ? (projectNameById.get(l.project_id) ?? null)
            : null,
          contact_id: lineContactId,
          contact_name: lineContactId
            ? (contactNameById.get(lineContactId) ?? null)
            : null,
          source_currency_id: bankAccountCurrencyId,
          system_exchange_rate: bankTxn.system_exchange_rate,
          custom_exchange_rate: bankTxn.system_exchange_rate,
          signed_native_amount: l.signed_native_amount,
          description: l.description ?? p.description ?? bankTxn.description,
          is_bank_leg: false,
          explanation: l.explanation,
          metadata: l.metadata,
        };
      });

    // Complete journal entry: bank leg + prediction lines (or accrual lines)
    const journalLines: CandidateLineDraft[] = [bankLeg, ...otherEntries];

    // Run constraint validation on complete journal entry
    // Design Decision: Validate AFTER persisting prediction to ensure auditability
    // This validates the complete double-entry journal (debits = credits, valid accounts, etc.)
    logger.debug(
      {
        bankTransactionId: bankTxnId,
        journalLinesCount: journalLines.length,
        companyUUID,
      },
      'Running constraint validation on journal entry',
    );
    // Map CandidateLineDraft to constraint context entries format
    // Note: Constraint runner expects entries with: id, amount, coa_id, fs_date (optional),
    //       project_id (optional), is_bank_leg (optional), system_exchange_rate (optional)
    // All required fields are present in CandidateLineDraft and mapped correctly here
    const constraintEntries = journalLines.map((line, index) => ({
      id: `${index}`, // String identifier for the entry
      amount: line.signed_native_amount, // Signed amount (positive = debit, negative = credit)
      coa_id: line.coa_id, // Chart of Account ID (UUID as string)
      fs_date: line.fs_date, // Financial statement date (YYYY-MM-DD format)
      project_id: line.project_id ?? null, // Optional project ID
      is_bank_leg: line.is_bank_leg, // Whether this is the bank account leg
      system_exchange_rate: line.system_exchange_rate, // Exchange rate for currency conversion
    }));

    const constraintResult = await runConstraints(
      {
        companyUUID,
        entries: constraintEntries,
        transaction_date: p.ledger_date ?? bankTxn.transaction_date,
      },
      txn, // Pass the transaction to avoid deadlocks and ensure consistency
    );

    if (!constraintResult.isValid) {
      // Constraint validation failed - log event and throw error
      // Note: Prediction is already persisted (for auditability), but candidate is not created
      // Determine event stage based on source
      const eventStage =
        source === 'rule'
          ? 'rule_engine'
          : source === 'ml' || source === 'ml_heuristic'
            ? 'ml_engine'
            : 'validation';

      await logTaskEventSafe({
        categorization_task_id: event.categorization_task_id,
        run_id: runId,
        event_stage: eventStage,
        event_type: 'constraint_validation_failed',
        event_timestamp: new Date(),
        metadata: {
          prediction_id: predictionId,
          source,
          violations: constraintResult.violations,
          errors: constraintResult.errors,
          warnings: constraintResult.warnings,
        },
        trx: txn,
      });
      logger.error(
        {
          companyUUID,
          bankTransactionId: bankTxnId,
          predictionId,
          categorizationTaskId: event.categorization_task_id,
          violations: constraintResult.violations,
          errors: constraintResult.errors,
          warnings: constraintResult.warnings,
        },
        'Constraint validation failed for candidate - prediction persisted but candidate not created',
      );

      // Throw error to prevent candidate creation
      // Future: Consider auto-fixing certain violations or allowing warnings
      throw new Error(
        `Constraint validation failed: ${constraintResult.errors.map((e) => e.message).join('; ')}`,
      );
    }

    logger.debug(
      {
        bankTransactionId: bankTxnId,
        predictionId,
        journalLinesCount: journalLines.length,
      },
      'Constraint validation passed, creating candidate',
    );

    // Build candidate object with complete journal entry
    // Candidate includes: prediction reference, transaction metadata, and complete journal lines
    const candidateObj = {
      source,
      categorization_task_id: event.categorization_task_id,
      prediction_id: predictionId, // Persisted prediction must have ID
      bank_transaction_id: bankTxnId,
      bank_transaction_date: bankTxn.transaction_date,
      company_id: companyUUID,
      contact_id: p.contact_id ?? null,
      contact_type: p.contact_type ?? null,
      reference: p.reference ?? bankTxn.reference ?? null,
      description: p.description ?? bankTxn.description,
      confidence: p.confidence,
      explanation: p.explanation,
      metadata: p.metadata ?? {},
      candidate_lines: journalLines, // Complete journal entry: bank leg + prediction lines
    };

    // Persist candidate (handles conflict resolution automatically)
    // If a candidate already exists, persistCategorizationCandidate will:
    // - Compare sources and confidence
    // - Replace if new candidate is better (rule > ml > ml_heuristic, or higher confidence)
    // - Log events for candidate_created, candidate_replaced, or candidate_ignored
    const candidateResult = await persistCategorizationCandidate({
      candidate: candidateObj,
      runId,
      trx: txn,
    });
    const candidateId = candidateResult.candidateId;

    if (!candidateId) {
      throw new Error('Failed to persist candidate');
    }

    // Contact resolution retired (v1) — call disabled.
    /*
    await updateBankTransactionContactResolution({
      trx: txn,
      companyId: companyUUID,
      bankTransactionId: bankTxnId,
      contactId: p.contact_id,
      contactType: p.contact_type,
      source: source === 'rule' ? 'rule' : 'system',
      confidence: p.confidence,
      reason:
        source === 'rule'
          ? 'Categorization rule selected contact'
          : 'Categorization prediction selected contact',
    });
    */

    logger.debug(
      {
        bankTransactionId: bankTxnId,
        predictionId,
        source,
      },
      'Candidate persisted successfully',
    );

    // Check autopost eligibility and handle accordingly
    // Rules: Post immediately if autopost_rules is true
    // ML: Post immediately if delay is 0, otherwise enqueue delayed job

    let immediateAutopostSucceeded = false;
    const eligibility = await checkAutopostEligibility({
      source,
      confidence: p.confidence,
      companyId: companyUUID,
      trx: txn,
    });

    if (
      candidateResult.reviewState === 'pending_review' &&
      eligibility.shouldAutopost
    ) {
      if (eligibility.isImmediate) {
        // Post immediately within the same transaction
        try {
          const result = await postCandidateToLedger({
            candidateInput: candidateObj,
            bankTransaction: {
              id: bankTxnId,
              bankAccountCurrencyId,
              transactionValue: bankTxn.amount,
            },
            candidateId,
            companyId: companyUUID,
            runId,
            trx: txn,
          });

          if (result.success) {
            immediateAutopostSucceeded = true;
            logger.info(
              {
                candidateId,
                bankTransactionId: bankTxnId,
                source,
                ledgerTransactionId: result.ledgerTransactionId,
              },
              'Candidate autoposted immediately to ledger',
            );
          } else {
            logger.warn(
              {
                candidateId,
                bankTransactionId: bankTxnId,
                source,
                error: result.error,
              },
              'Failed to autopost candidate immediately, but candidate was persisted',
            );
            // Don't throw - candidate is persisted, autopost failure shouldn't block it
          }
        } catch (error) {
          logger.error(
            {
              candidateId,
              bankTransactionId: bankTxnId,
              source,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Error during immediate autopost, but candidate was persisted',
          );
          // Don't throw - candidate is persisted, autopost failure shouldn't block it
        }
      } else if (eligibility.delayMs) {
        // Enqueue delayed autopost job (after transaction commits)
        // Use setImmediate to ensure transaction commits first
        setImmediate(async () => {
          try {
            await enqueueDelayedAutopost({
              candidateId,
              companyId: companyUUID,
              runId,
              delayMs: eligibility.delayMs!,
            });
            logger.info(
              {
                candidateId,
                bankTransactionId: bankTxnId,
                source,
                delayMs: eligibility.delayMs,
                delayMinutes: Math.round(eligibility.delayMs! / 60000),
              },
              'Delayed autopost job enqueued',
            );
          } catch (error) {
            logger.error(
              {
                candidateId,
                bankTransactionId: bankTxnId,
                source,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              'Failed to enqueue delayed autopost job',
            );
            // Don't throw - this is async, errors are logged
          }
        });
      }
    }

    if (!immediateAutopostSucceeded) {
      if (
        candidateResult.reviewState === 'pending_review' &&
        (candidateResult.outcome === 'created' ||
          candidateResult.outcome === 'replaced')
      ) {
        const eventType =
          candidateResult.outcome === 'replaced'
            ? ACTIVITY_EVENT_TYPE.CATEGORIZATION_SUGGESTION_REPLACED
            : ACTIVITY_EVENT_TYPE.CATEGORIZATION_SUGGESTION_CREATED;
        await writeActivityEventIntent(txn, {
          clientCompanyId: companyUUID,
          actor: { type: 'system' },
          sourceEntity: { type: 'categorization_candidate', id: candidateId },
          eventType,
          itemCount: 1,
          amount: bankTxn.amount,
          currencyId: bankAccountCurrencyId,
          idempotencyKey: `activity:${eventType}:${candidateId}`,
          metadata: {
            bankTransactionId: bankTxnId,
            bankAccountId: bankTxn.bank_account_id,
            predictionId,
            source,
            confidence: p.confidence,
            outcome: candidateResult.outcome,
            previousCandidateId:
              candidateResult.outcome === 'created'
                ? candidateResult.previousCandidateId
                : null,
            replacedCandidateId:
              candidateResult.outcome === 'replaced'
                ? candidateResult.replacedCandidateId
                : null,
          },
        });
      }

      await writeBankAccountWorkMaterializationIntent(txn, {
        clientCompanyId: companyUUID,
        bankAccountId: bankTxn.bank_account_id,
        change: {
          type: `categorization_candidate_${candidateResult.outcome}`,
          companyId: companyUUID,
          bankAccountId: bankTxn.bank_account_id,
          bankTransactionId: bankTxnId,
          candidateId,
        },
      });
      await scheduleOutboxDispatchKickAfterCommit(txn);
    }
  };

  if (trx) {
    return await exec(trx);
  } else {
    return await knexClient.transaction(exec);
  }
}
