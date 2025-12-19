import type { Knex } from 'knex';

import type { ApiResponse } from '../../core/types/api.types.js';
import { knexClient } from '../../db/knexClient.js';
import { logger } from '../../shared/utils/logger.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { updateOrCreateLedger } from '../ledgers/ledgers.model.js';
import type { UpdateOrCreateLedgerInput } from '../ledgers/ledgers.types.js';
import type { CategorizationIntent } from './categorization.types.js';

/**
 * Process categorization intent
 * Validates intent, checks idempotency, transforms to ledger format, and posts to ledger
 */
export async function processCategorizationIntent({
  intent,
  companyId,
  userId,
  trx,
}: {
  intent: CategorizationIntent;
  companyId: string;
  userId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    ledgerTransactionId?: string;
    affected_transaction_ids?: string[];
    summary_message?: string;
  }>
> {
  const exec = async (txn: Knex.Transaction) => {
    // Idempotency is handled by updateOrCreateLedger's detectChangedFields
    // If the same intent is sent twice, it will detect no changes and return success without modifying data
    // Intent is logged to audit_events for audit trail

    // Transform intent to UpdateOrCreateLedgerInput
    const ledgerInput = await transformIntentToLedgerInput({
      intent,
      companyId,
      userId,
      txn,
    });

    if (!ledgerInput.success) {
      return ledgerInput;
    }

    // Call updateOrCreateLedger
    const ledgerResult = await updateOrCreateLedger({
      data: [ledgerInput.data] as any,
      companyId,
      userId,
      trx: txn,
    });

    if (!ledgerResult.success) {
      return errorResponse(
        ledgerResult.message || 'Failed to update or create ledger transaction',
        ledgerResult.error,
      );
    }

    const result = ledgerResult.data?.[0];
    if (!result) {
      return errorResponse('No result returned from updateOrCreateLedger');
    }

    // Log intent for audit trail (using audit_events table)
    await txn('audit_events').insert({
      entity_type: 'transaction',
      entity_id: intent.transaction_id,
      action: 'edit',
      payload: {
        intent_id: intent.intent_id,
        intent_key: intent.intent_key,
        action_type: intent.action_type,
        payload: intent.payload,
        client_version: intent.client_version,
        transaction_state: intent.transaction_state,
        ledger_transaction_id: result.ledgerTransactionId,
      },
      company_id: companyId,
      user_id: userId,
      notes: `Intent processed: ${intent.action_type}`,
      created_at: txn.fn.now(),
      updated_at: txn.fn.now(),
    });

    // Determine affected transaction IDs (for FX rate changes)
    const affected_transaction_ids: string[] = [];
    if (intent.action_type === 'UPDATE_FX_RATE') {
      // FX rate changes affect all entries for the bank transaction
      // TODO: Query all ledger entries for this bank transaction
      affected_transaction_ids.push(intent.transaction_id);
    }

    return successResponse('Intent processed successfully', {
      ledgerTransactionId: result.ledgerTransactionId,
      affected_transaction_ids:
        affected_transaction_ids.length > 0
          ? affected_transaction_ids
          : undefined,
      summary_message:
        affected_transaction_ids.length > 0
          ? `Updated ${affected_transaction_ids.length} transaction(s)`
          : undefined,
    });
  };

  try {
    if (trx) {
      return (await exec(trx)) as any;
    } else {
      return (await knexClient.transaction(exec)) as any;
    }
  } catch (error) {
    logger.error(
      {
        intent_id: intent.intent_id,
        companyId,
        error,
      },
      'Failed to process categorization intent',
    );
    return errorResponse('Failed to process intent', { error });
  }
}

/**
 * Transform intent to UpdateOrCreateLedgerInput
 */
async function transformIntentToLedgerInput({
  intent,
  companyId,
  userId,
  txn,
}: {
  intent: CategorizationIntent;
  companyId: string;
  userId: string;
  txn: Knex.Transaction;
}): Promise<
  ApiResponse<UpdateOrCreateLedgerInput & { source_transaction_id: string }>
> {
  // Get bank transaction to understand current state
  const bankTxn = await txn('bank_transactions')
    .where({
      id: intent.transaction_id,
      company_id: companyId,
      is_deleted: false,
    })
    .first();

  if (!bankTxn) {
    return errorResponse('Bank transaction not found');
  }

  // Check if ledger transaction already exists
  const existingLedgerTxn = await txn('ledger_transactions')
    .where({
      source_transaction_id: intent.transaction_id,
      company_id: companyId,
      is_deleted: false,
    })
    .first();

  // Get current ledger entries if transaction exists
  let currentEntries: any[] = [];
  if (existingLedgerTxn) {
    currentEntries = await txn('ledger_entries')
      .where({
        ledger_transaction_id: existingLedgerTxn.id,
        is_deleted: false,
      })
      .orderBy('created_at', 'asc');
  }

  // Transform based on action type
  switch (intent.action_type) {
    case 'ASSIGN_ACCOUNT': {
      const payload = intent.payload as { entryId: string; coaId: string };
      // TODO: Build ledger transaction with assigned account
      // For now, return error - this needs full implementation
      return errorResponse('ASSIGN_ACCOUNT not yet implemented');
    }
    case 'UPDATE_DESCRIPTION':
    case 'UPDATE_FS_DATE':
    case 'UPDATE_CONTACT':
    case 'UPDATE_REFERENCE':
    case 'UPDATE_PROJECT': {
      // These are metadata updates - use updateOrCreateLedger with partial data
      const ledgerInput: UpdateOrCreateLedgerInput = {
        transaction_source: 'bank_transaction',
        categorization_source: 'manual',
        source_transaction_id: intent.transaction_id,
        source_transaction_date: bankTxn.date,
        source_transaction_amount: bankTxn.amount,
        source_transaction_currency_id: bankTxn.bank_currency_id,
        ...(existingLedgerTxn && {
          ledger_transaction_id: existingLedgerTxn.id,
        }),
        // TODO: Apply updates based on action type and scope
        // This is a simplified version - full implementation needed
      };

      return successResponse('Transformed intent', {
        ...ledgerInput,
        source_transaction_id: intent.transaction_id,
      });
    }
    case 'UPDATE_FX_RATE': {
      const payload = intent.payload as {
        bankTransactionId: string;
        rate: number;
      };
      // FX rate update affects all entries - need to update all ledger entries
      // TODO: Build complete ledger transaction with updated FX rate
      return errorResponse('UPDATE_FX_RATE not yet fully implemented');
    }
    case 'POST_TO_LEDGER': {
      // Post uncategorized transaction to ledger
      // TODO: Build ledger transaction from bank transaction
      return errorResponse('POST_TO_LEDGER not yet implemented');
    }
    default:
      return errorResponse(`Unknown action type: ${intent.action_type}`);
  }
}
