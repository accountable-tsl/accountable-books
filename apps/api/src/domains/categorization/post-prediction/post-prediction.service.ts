import type { Knex } from 'knex';
import { logger } from '../../../shared/index.js';
import type { TransactionEnrichedEventData } from '../events/transaction-events.service.js';
import type { RuleEngineResult } from '../rules/rules.engine.types.js';
import { logTaskEventSafe } from '../tasks/task-events.service.js';
import type {
  PersistPredictionParams,
  RulePredictionMetadata,
} from './predictions/predictions.types.js';
import type {
  HandlePostPredictionParams,
  HandleRulePredictionParams,
} from './post-prediction.types.js';
import { enqueueMLPredictionJob } from '../ml/ml-prediction.queue.js';
import type { TaskEventType } from '../tasks/index.js';
import { persistPrediction } from './predictions/predictions.service.js';
import {
  allEqual,
  buildExplanationFromRuleResult,
  computeCategorizeAmounts,
} from './post-prediction.helpers.js';
import type { CandidateLineDraft } from './candidates/candidates.types.js';
import { getCurrency } from '../../currencies/currencies.utils.js';

const CATEGORIZATION_TASKS_TABLE = 'categorization_tasks';

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
  if (params.source === 'rule') {
    await handleRulePrediction({
      event: params.event,
      ruleResult: params.result,
      runId: params.runId,
      error: params.error,
      trx: params.trx,
    });

    // Schedule ML enqueueing to happen after transaction commits
    // Use setImmediate to ensure it runs after the current transaction completes
    if (params.result) {
      setImmediate(async () => {
        await enqueueMlIfNeeded(params.event, params.result);
      });
    } else if (params.error) {
      // Even on error, we might want to enqueue ML as fallback
      setImmediate(async () => {
        await enqueueMlIfNeeded(params.event, null);
      });
    }
  } else {
    // ML prediction handling will be implemented later
    throw new Error('ML prediction handling not yet implemented');
  }
}

/**
 * Handle post-rules processing: update task, create predictions/candidates
 * Internal function - use handlePostPrediction instead
 */
async function handleRulePrediction(
  params: HandleRulePredictionParams,
): Promise<void> {
  const { event, ruleResult, runId, error, trx } = params;

  // Use the provided transaction (assumes it's already in a transaction)
  // Serialize candidate/prediction writes per task
  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
    event.categorization_task_id,
  ]);

  // Handle exception case (rules engine failed to complete)
  if (error || !ruleResult) {
    await logTaskEventSafe({
      categorization_task_id: event.categorization_task_id,
      run_id: runId,
      source: 'rule',
      event_type: 'rules_failed', // Exception before completion
      event_timestamp: new Date(),
      metadata: {
        error_message:
          error instanceof Error ? error.message : 'rule_runner_unknown_error',
      },
      trx,
    });

    return;
  }

  await logTaskEventSafe({
    categorization_task_id: event.categorization_task_id,
    run_id: runId,
    source: 'rule',
    event_type: eventTypeMap[ruleResult.status],
    event_timestamp: new Date(),
    metadata: {
      status: ruleResult.status,
      applied_rule_ids: ruleResult.appliedRuleIds,
    },
    trx,
  });

  // If rules applied successfully, create prediction and candidate
  if (ruleResult.status === 'applied') {
    // await createPredictionAndCandidateFromRuleResult(
    //   event,
    //   ruleResult,
    //   runId,
    //   trx,
    // );

    // Build prediction data
    const predictionData = buildPredictionFromRuleResult(event, ruleResult);

    // Persist prediction data
    await persistPrediction(predictionData, trx);
  }
}

/**
 * Map rule engine result status to task status
 * Note: This function is currently unused - task status updates have been removed
 */
function mapResultToTaskStatus(result: RuleEngineResult): string | null {
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

/**
 * Create prediction and candidate from rule result
 */
async function createPredictionAndCandidateFromRuleResult(
  event: TransactionEnrichedEventData,
  result: RuleEngineResult,
  runId: string,
  knex: Knex.Transaction,
): Promise<void> {
  const categorizeLines = result.finalState.categorize;
  if (!categorizeLines?.length) {
    return;
  }

  const transactionAmount = Math.abs(event.enriched_transaction.raw.amount);
  if (transactionAmount === 0) {
    return;
  }

  const journalLines = buildJournalLines({
    categorizeLines,
    transactionAmount,
    direction: event.enriched_transaction.raw.amount > 0 ? 'inflow' : 'outflow',
    currencyCode: event.enriched_transaction.raw.currency_code,
    bankCoaId: event.enriched_transaction.ids.bank_account_coa_id,
  });

  if (journalLines.length === 0) {
    return;
  }

  const explanation = buildExplanationFromRuleResult(result);

  // Get all applied rule logs
  const appliedRuleLogs = result.logs.filter(
    (log) =>
      log.status === 'success' && result.appliedRuleIds.includes(log.ruleId),
  );

  if (appliedRuleLogs.length === 0) {
    throw new Error(
      'Cannot create rule prediction metadata: no applied rules found',
    );
  }

  // Build typed metadata for rule prediction with all applied rules
  const metadata: RulePredictionMetadata = {
    provenance: 'rule_engine',
    run_id: result.runId,
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

  await processPredictionToCandidate({
    categorizationTaskId: event.categorization_task_id,
    bankTransactionId: event.bank_transaction_id,
    bankTransactionDate: event.enriched_transaction.raw.date,
    companyId: event.company_uuid,
    source: 'rule',
    runId,
    lines: journalLines,
    confidence: 1,
    explanation,
    metadata,
    enrichedTransaction: event.enriched_transaction,
    knex,
    softDeleteExistingPredictions: false,
  });
}

/**
 * Determine if ML prediction should be enqueued and enqueue if needed
 * Note: ML enqueueing happens after transaction commits to avoid blocking
 */
export async function enqueueMlIfNeeded(
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

    // Enqueue ML prediction job (after transaction commits)
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

/**
 * Builds prediction object from rule result
 * Note: This function builds predictions WITHOUT bank leg (only what rules predicted)
 */
function buildPredictionFromRuleResult(
  event: TransactionEnrichedEventData,
  result: RuleEngineResult,
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
    run_id: result.runId,
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
      run_id: result.runId,
      company_id: event.company_uuid,
      source: 'rule',
      ...(contactId ? { contact_id: contactId } : {}),
      ...(contactType ? { contact_type: contactType } : {}),
      ...(description ? { description } : {}),
      ...(reference ? { reference } : {}),
      ...(ledgerDate ? { ledger_date: ledgerDate } : {}),
      confidence: 1,
      model_version: null,
      explanation,
      metadata,
    },
    predictionLines: [firstLine, ...restLines],
  };
}

async function processPredictionsToCandidates(
  event: TransactionEnrichedEventData,
  prediction: PersistPredictionParams,
  trx?: Knex.Transaction,
) {
  // Ignore anything or everything that has been done
  // Verify bank transaction belongs to the said company
  // Verify all coa ids exist and belong to the company
  // Build bank leg
  // Build journal entries
  // Run constraints solver
  // -- Validate that all amounts resolve to zero
  // -- Debits must equal credits
  // -- Consider company accounting basis
  //      -- modified_cash stays same
  //      -- be build simple rules to handle this without - this must make sense
  //

  const enrichedTransaction = event.enriched_transaction;
  const { prediction: p, predictionLines } = prediction;

  const companyUUID = event.company_uuid;
  const companyIdFromEnrichedTxn = enrichedTransaction.ids.company_uuid;
  const companyIdFromPrediction = p.company_id;

  if (
    !allEqual(companyUUID, companyIdFromEnrichedTxn, companyIdFromPrediction)
  ) {
    // Log and throw
    throw new Error('');
  }

  const bankTxnId = event.bank_transaction_id;
  const bankTxnIdFromEnrichedTxn = enrichedTransaction.ids.bank_transaction_id;
  const bankTxnIdFromPrediction = p.bank_transaction_id;

  if (!allEqual(bankTxnId, bankTxnIdFromEnrichedTxn, bankTxnIdFromPrediction)) {
    // Log and throw
  }

  const bankTxnDate = enrichedTransaction.raw.date;

  const exec = async (txn: Knex.Transaction) => {
    // Does this transaction belong to the said company?
    const bankTxn = await txn('bank_transactions as bt')
      .select([
        'bt.*',
        'ba.coa_id as bank_coa_id',
        'ba.currency_id as bank_account_currency_id',
      ])
      .where({
        id: bankTxnId,
        date: bankTxnDate,
        company_id: companyUUID,
        is_deleted: false,
      })
      .join('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
      .first();

    const bankAccountCoaId = bankTxn?.bank_coa_id;
    const bankAccountCurrencyId = bankTxn?.bank_account_currency_id;
    if (
      !bankTxn ||
      !bankAccountCoaId ||
      bankAccountCoaId !== enrichedTransaction.ids.bank_account_coa_id ||
      !bankAccountCurrencyId
    ) {
      // If this ever happens, something is fundamentally wrong
      // Log and throw
      logger;
      throw new Error('');
    }

    // Verify all predicted coa_ids belong to this company and are active
    const predictedCoaIds = predictionLines.map((p) => p.coa_id);
    const coas = await txn('coa')
      .whereIn('id', predictedCoaIds)
      .where('company_id', companyUUID)
      .where('is_deleted', false)
      .where('is_active', true)
      .select('id');

    if (coas.length !== predictedCoaIds.length) {
      // Find out what happened, then log and throw
    }

    // Build bank leg
    const bankLeg: CandidateLineDraft = {
      fs_date: p.ledger_date ?? bankTxn.date,
      status: 'proposed',
      transaction_side: bankTxn.amount > 0 ? 'debit' : 'credit',
      coa_id: bankAccountCoaId,
      source_currency_id: bankAccountCurrencyId,
      system_exchange_rate: bankTxn.system_exchange_rate,
      signed_native_amount: bankTxn.amount,
      description: p.description ?? bankTxn.description,
      is_bank_leg: true,
      explanation: '', // Add later
    };

    // Build other entries
    const otherEntries: CandidateLineDraft[] = predictionLines
      .filter((l) => !l.is_bank_leg)
      .map((l) => {
        return {
          fs_date: p.ledger_date ?? bankTxn.date,
          status: 'proposed',
          transaction_side: l.signed_native_amount > 0 ? 'debit' : 'credit',
          coa_id: l.coa_id,
          project_id: l.project_id,
          source_currency_id: bankAccountCurrencyId,
          system_exchange_rate: bankTxn.system_exchange_rate,
          signed_native_amount: l.signed_native_amount,
          description: l.description ?? p.description ?? bankTxn.description,
          is_bank_leg: false,
          explanation: l.explanation,
          metadata: l.metadata,
        };
      });

    const journalLines: CandidateLineDraft[] = [bankLeg, ...otherEntries];

    if (source === "ml" || source === "ml_heuristic" ){
        applyAccountingModifiers(journalLines);
    }
    const currencyCode = enrichedTransaction.raw?.currency_code;
    const transactionAmount = enrichedTransaction.raw?.amount;
  };
}
