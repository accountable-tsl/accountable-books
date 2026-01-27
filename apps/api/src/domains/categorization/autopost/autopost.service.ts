import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { logger } from '../../../shared/index.js';
import { createLedgerRecord } from '../../ledgers/ledgers.model.js';
import { getCompanySetting } from '../../settings/settings.service.js';
import { getSystemUser } from '../../users/users.model.js';
import { logTaskEventSafe } from '../tasks/task-events.service.js';

import type { NewLedgerTransactionData } from '../../ledgers/ledgers.types.js';
import type { AutopostAi } from '../../settings/settings.types.js';
import type { CandidateInput } from '../candidates/candidates.types.js';
import type { TxnCategorizationSource } from '../categorization.types.js';

export interface AutopostEligibilityResult {
  shouldAutopost: boolean;
  isImmediate: boolean;
  delayMs?: number;
}

/**
 * Checks if a candidate should be autoposted based on company settings and confidence threshold.
 * @param source - Source of categorization (rule, ml, ml_heuristic)
 * @param confidence - Confidence of the categorization
 * @param companyId - Company ID
 * @param trx - Optional transaction object
 * @returns An object indicating whether the candidate should be autoposted, whether it should be posted immediately, and the delay in milliseconds (if applicable)
 */
export async function checkAutopostEligibility({
  source,
  confidence,
  companyId,
  trx,
}: {
  source: TxnCategorizationSource;
  confidence: number;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<AutopostEligibilityResult> {
  // For rules: Check autopost_rules setting
  if (source === 'rule') {
    const settingsResult = await getCompanySetting({
      companyId,
      settingKeys: ['autopost_rules'],
      trx,
    });

    if (!settingsResult.success || !settingsResult.data) {
      logger.warn(
        { companyId, source },
        'Failed to retrieve autopost_rules setting',
      );
      return { shouldAutopost: false, isImmediate: false };
    }

    const autopostRules = settingsResult.data.autopost_rules as boolean;
    return {
      shouldAutopost: autopostRules,
      isImmediate: true, // Rules always post immediately if enabled
    };
  }

  // For ML sources: Check autopost_ai setting
  if (source === 'ml' || source === 'ml_heuristic') {
    const settingsResult = await getCompanySetting({
      companyId,
      settingKeys: ['autopost_ai'],
      trx,
    });

    if (!settingsResult.success || !settingsResult.data) {
      logger.warn(
        { companyId, source },
        'Failed to retrieve autopost_ai setting',
      );
      return { shouldAutopost: false, isImmediate: false };
    }

    const autopostAi = settingsResult.data.autopost_ai as AutopostAi;

    // Check if autopost is enabled and confidence threshold is met
    if (!autopostAi.enabled || confidence < autopostAi.min_confidence) {
      return { shouldAutopost: false, isImmediate: false };
    }

    const delayMinutes = autopostAi.delay_minutes ?? 0;
    const delayMs = delayMinutes * 60 * 1000;

    return {
      shouldAutopost: true,
      isImmediate: delayMs === 0,
      delayMs: delayMs > 0 ? delayMs : undefined,
    };
  }

  // Unknown source - don't autopost
  return { shouldAutopost: false, isImmediate: false };
}

/**
 * Post candidate to ledger - main posting function
 * Checks if already posted, creates ledger transaction, links bank transaction, and logs events
 */
export async function postCandidateToLedger({
  candidateInput,
  bankTransaction,
  candidateId,
  companyId,
  runId,
  trx,
}: {
  candidateInput: CandidateInput;
  bankTransaction: {
    id: string;
    bankAccountCurrencyId: string;
    transactionValue: number;
    [key: string]: any;
  };
  candidateId: string;
  companyId: string;
  runId: string;
  trx?: Knex.Transaction;
}): Promise<{
  success: boolean;
  ledgerTransactionId?: string;
  error?: string;
}> {
  const bankTransactionId = bankTransaction.id;
  const exec = async (txn: Knex.Transaction) => {
    // Race condition check: Check if already posted
    const bankTxn = await txn('bank_transactions')
      .where({ id: bankTransactionId })
      .first('ledger_transaction_id', 'company_id');

    if (!bankTxn) {
      logger.warn(
        { bankTransactionId },
        'Bank transaction not found for autopost',
      );
      return { success: false, error: 'Bank transaction not found' };
    }

    // Check if already posted
    if (bankTxn.ledger_transaction_id) {
      logger.info(
        {
          bankTransactionId,
          ledgerTransactionId: bankTxn.ledger_transaction_id,
        },
        'Bank transaction already posted to ledger, skipping autopost',
      );
      return {
        success: true,
        ledgerTransactionId: bankTxn.ledger_transaction_id,
      };
    }

    // Use advisory lock to prevent concurrent posts for the same company
    await txn.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [companyId]);

    // Double-check after acquiring lock (someone might have posted while waiting)
    const bankTxnAfterLock = await txn('bank_transactions')
      .where({ id: bankTransactionId })
      .first('ledger_transaction_id');

    if (bankTxnAfterLock?.ledger_transaction_id) {
      logger.info(
        {
          bankTransactionId,
          ledgerTransactionId: bankTxnAfterLock.ledger_transaction_id,
        },
        'Bank transaction posted during lock acquisition, skipping autopost',
      );
      return {
        success: true,
        ledgerTransactionId: bankTxnAfterLock.ledger_transaction_id,
      };
    }

    // Get system user ID
    const systemUser = await getSystemUser({ trx: txn });
    if (!systemUser?.id) {
      logger.error({ companyId }, 'System user not found');
      return { success: false, error: 'System user not found' };
    }

    // Convert candidate to ledger format
    const ledgerData = buildLedgerTxnFromCandidate({
      candidateInput,
      bankTransaction,
      candidateId,
    });

    // Create ledger transaction
    const ledgerResult = await createLedgerRecord({
      data: ledgerData,
      autoPost: true, // This is an autopost operation
      companyId,
      userId: systemUser.id,
      trx: txn,
    });

    if (!ledgerResult.success) {
      logger.error(
        {
          candidateId,
          bankTransactionId,
          error: ledgerResult.error,
        },
        'Failed to create ledger transaction for autopost',
      );
      const errorMessage =
        typeof ledgerResult.error === 'string'
          ? ledgerResult.error
          : 'Failed to create ledger transaction';
      return {
        success: false,
        error: errorMessage,
      };
    }

    if (
      !ledgerResult.data ||
      typeof ledgerResult.data !== 'object' ||
      !('ledgerTransactionId' in ledgerResult.data)
    ) {
      logger.error(
        { candidateId, bankTransactionId, ledgerResult },
        'Ledger transaction ID not returned from createLedgerRecord',
      );
      return {
        success: false,
        error: 'Ledger transaction ID not returned',
      };
    }

    const ledgerTransactionId = (
      ledgerResult.data as { ledgerTransactionId: string }
    ).ledgerTransactionId;

    // Log categorization task event
    await logTaskEventSafe({
      categorization_task_id: candidateInput.categorization_task_id,
      run_id: runId,
      event_stage: 'candidate',
      event_type: 'candidate_accepted',
      event_timestamp: new Date(),
      metadata: {
        candidate_id: candidateId,
        ledger_transaction_id: ledgerTransactionId,
        autoposted: true,
        source: candidateInput.source,
        bank_transaction_id: bankTransactionId,
      },
      trx: txn,
    });

    logger.info(
      {
        candidateId,
        bankTransactionId,
        ledgerTransactionId,
        source: candidateInput.source,
      },
      'Candidate autoposted to ledger successfully',
    );

    return { success: true, ledgerTransactionId };
  };

  if (trx) {
    return exec(trx);
  } else {
    return knexClient.transaction(exec);
  }
}

export function buildLedgerTxnFromCandidate({
  candidateInput,
  bankTransaction,
  candidateId,
}: {
  candidateInput: CandidateInput;
  bankTransaction: {
    bankAccountCurrencyId: string;
    transactionValue: number;
    [key: string]: any;
  };
  candidateId: string;
}): NewLedgerTransactionData {
  const { candidate_lines: cline, ...c } = candidateInput;

  const transactions = cline.map((l) => ({
    fs_date: l.fs_date,
    coa_id: l.coa_id,
    source_currency_id: l.source_currency_id,
    source_amount: l.signed_native_amount,

    contact_id: l.contact_id ?? c.contact_id ?? null,
    contact_type: l.contact_type ?? c.contact_type ?? null,

    description: l.description ?? c.description ?? null,
    project_id: l.project_id,

    is_bank_leg: l.is_bank_leg,
    metadata: l.metadata ?? c.metadata ?? undefined,
  }));

  return {
    date: c.bank_transaction_date,
    transaction_source: 'bank_transaction',
    categorization_source: c.source,
    description: c.description,
    reference: c.reference,

    contact_id: c.contact_id,
    contact_type: c.contact_type,

    source_transaction_id: c.bank_transaction_id,
    source_transaction_date: new Date(c.bank_transaction_date),
    source_transaction_amount: bankTransaction.transactionValue,
    source_transaction_currency_id: bankTransaction.bankAccountCurrencyId,

    categorization_candidate_id: candidateId,

    transactions,
    metadata: {
      ...(candidateInput.metadata ?? {}),
      categorization_task_id: candidateInput.categorization_task_id,
      prediction_id: candidateInput.prediction_id,
    },
  };
}
