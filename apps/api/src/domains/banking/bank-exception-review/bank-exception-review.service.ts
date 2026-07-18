import type { Knex } from 'knex';

import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { deleteBankTransactions } from '../../bankTransactions/bankTransactions.model.js';
import { NOTIFICATION_TYPE } from '../../notifications/notifications.types.js';
import {
  buildBankReplacementUnmatchedAttentionKey,
  buildBankTransactionRemovedAttentionKey,
  buildBankTransactionSupersededAttentionKey,
  resolveBankReviewAttention,
} from '../bankAccounts/bankAccountNotifications.js';

import type { ApiResponse } from '../../../core/types/api.types.js';

export async function acknowledgeBankTransactionSupersededReview({
  companyId,
  bankAccountId,
  bankTransactionId,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  bankTransactionId: string;
  actorUserId: string;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{ bankTransactionId: string; alreadyResolved: boolean }>
> {
  const txn = await loadBankTransactionForReview(trx, {
    companyId,
    bankAccountId,
    bankTransactionId,
  });
  if (!txn) {
    return errorResponse('Bank transaction not found', null);
  }

  const attentionKey =
    buildBankTransactionSupersededAttentionKey(bankTransactionId);
  const resolvedCount = await resolveBankReviewAttention(trx, {
    clientCompanyId: companyId,
    attentionKey,
    eventType: NOTIFICATION_TYPE.BANK_TRANSACTION_SUPERSEDED_REVIEW,
    stateVersion: new Date(),
  });

  return successResponse('Superseded review acknowledged', {
    bankTransactionId,
    alreadyResolved: resolvedCount === 0,
  });
}

export async function acknowledgeBankTransactionRemovedReview({
  companyId,
  bankAccountId,
  bankTransactionId,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  bankTransactionId: string;
  actorUserId: string;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{ bankTransactionId: string; alreadyResolved: boolean }>
> {
  const txn = await loadBankTransactionForReview(trx, {
    companyId,
    bankAccountId,
    bankTransactionId,
  });
  if (!txn) {
    return errorResponse('Bank transaction not found', null);
  }

  const attentionKey =
    buildBankTransactionRemovedAttentionKey(bankTransactionId);
  const resolvedCount = await resolveBankReviewAttention(trx, {
    clientCompanyId: companyId,
    attentionKey,
    eventType: NOTIFICATION_TYPE.BANK_TRANSACTION_REMOVED_REVIEW,
    stateVersion: new Date(),
  });

  return successResponse('Removed review acknowledged', {
    bankTransactionId,
    alreadyResolved: resolvedCount === 0,
  });
}

export async function resolveReplacementUnmatchedReview({
  companyId,
  bankAccountId,
  bankTransactionId,
  decision,
  actorUserId,
  trx,
}: {
  companyId: string;
  bankAccountId: string;
  bankTransactionId: string;
  decision: 'genuine' | 'duplicate';
  actorUserId: string;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{
    bankTransactionId: string;
    decision: 'genuine' | 'duplicate';
    retired: boolean;
    feedAttentionResolved: boolean;
  }>
> {
  const txn = await loadBankTransactionForReview(trx, {
    companyId,
    bankAccountId,
    bankTransactionId,
  });
  if (!txn) {
    return errorResponse('Bank transaction not found', null);
  }

  const feedEntry = await trx('bank_transaction_feed_entries')
    .where({
      company_id: companyId,
      bank_transaction_id: bankTransactionId,
      replacement_unmatched: true,
    })
    .first<{
      id: string;
      bank_account_feed_id: string;
    }>('id', 'bank_account_feed_id');

  if (!feedEntry) {
    return errorResponse(
      'Bank transaction is not an unresolved replacement-unmatched import',
      null,
    );
  }

  let retired = false;
  if (decision === 'duplicate') {
    const deleted = await deleteBankTransactions({
      companyId,
      userId: actorUserId,
      input: {
        bankTransactionIds: [bankTransactionId],
        reason: 'Confirmed duplicate after replacement reconnect review',
      },
      trx,
    });
    if (!deleted.success) {
      return errorResponse(
        deleted.message ?? 'Failed to retire duplicate bank transaction',
        deleted.error ?? null,
      );
    }
    retired = true;
  }

  await trx('bank_transaction_feed_entries')
    .where({ id: feedEntry.id })
    .update({
      replacement_unmatched: false,
      updated_at: trx.fn.now(),
    });

  const remaining = await trx('bank_transaction_feed_entries')
    .where({
      bank_account_feed_id: feedEntry.bank_account_feed_id,
      replacement_unmatched: true,
    })
    .count<{ count: string }>('id as count')
    .first();

  let feedAttentionResolved = false;
  if (Number(remaining?.count ?? 0) === 0) {
    const resolvedCount = await resolveBankReviewAttention(trx, {
      clientCompanyId: companyId,
      attentionKey: buildBankReplacementUnmatchedAttentionKey(
        feedEntry.bank_account_feed_id,
      ),
      eventType: NOTIFICATION_TYPE.BANK_REPLACEMENT_UNMATCHED_REVIEW,
      stateVersion: new Date(),
    });
    feedAttentionResolved = resolvedCount > 0;
  }

  return successResponse('Replacement-unmatched review resolved', {
    bankTransactionId,
    decision,
    retired,
    feedAttentionResolved,
  });
}

async function loadBankTransactionForReview(
  trx: Knex.Transaction,
  input: {
    companyId: string;
    bankAccountId: string;
    bankTransactionId: string;
  },
): Promise<{ id: string } | null> {
  const row = await trx('bank_transactions')
    .where({
      id: input.bankTransactionId,
      company_id: input.companyId,
      bank_account_id: input.bankAccountId,
    })
    .first<{ id: string }>('id');
  return row ?? null;
}
