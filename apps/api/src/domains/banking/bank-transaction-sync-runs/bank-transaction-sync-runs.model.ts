import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { newBankTransactionSyncRun } from './bank-transaction-sync-runs.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankTransactionSyncRunOutcome,
  NewBankTransactionSyncRun,
} from './bank-transaction-sync-runs.types.js';

export async function createSyncRun({
  data,
  trx,
}: {
  data: NewBankTransactionSyncRun;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const parsed = newBankTransactionSyncRun.safeParse(data);
  if (!parsed.success) {
    return errorResponse('Invalid sync run input', parsed.error.flatten());
  }

  const knex = trx ?? knexClient;
  try {
    const [row] = await knex('bank_transaction_sync_runs')
      .insert({
        ...parsed.data,
        outcome: parsed.data.outcome ?? 'running',
        started_at: parsed.data.started_at ?? knex.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return successResponse('Sync run created', { id: row.id });
  } catch (error) {
    return errorResponse('Failed to create sync run', error);
  }
}

export async function completeSyncRun({
  syncRunId,
  companyId,
  outcome,
  retryable,
  failureClassification,
  providerErrorCode,
  diagnosticSummary,
  pageCount,
  addedCount,
  modifiedCount,
  removedCount,
  trx,
}: {
  syncRunId: string;
  companyId: string;
  outcome: Exclude<BankTransactionSyncRunOutcome, 'running'>;
  retryable?: boolean | null;
  failureClassification?: string | null;
  providerErrorCode?: string | null;
  diagnosticSummary?: string | null;
  pageCount?: number | null;
  addedCount?: number | null;
  modifiedCount?: number | null;
  removedCount?: number | null;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const knex = trx ?? knexClient;
  try {
    const updated = await knex('bank_transaction_sync_runs')
      .where({ id: syncRunId, company_id: companyId })
      .where({ outcome: 'running' })
      .update({
        outcome,
        retryable: retryable ?? null,
        failure_classification: failureClassification ?? null,
        provider_error_code: providerErrorCode ?? null,
        diagnostic_summary: diagnosticSummary ?? null,
        page_count: pageCount ?? null,
        added_count: addedCount ?? null,
        modified_count: modifiedCount ?? null,
        removed_count: removedCount ?? null,
        completed_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

    if (!updated) {
      return errorResponse('Running sync run not found', null);
    }
    return successResponse('Sync run completed', { id: syncRunId });
  } catch (error) {
    return errorResponse('Failed to complete sync run', error);
  }
}
