import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import { getLogger } from '../../../shared/utils/logger.js';
import {
  resolveHistoryImportAttention,
  writeHistoryImportExpiredNotifications,
  writeHistoryImportExpiringSoonNotifications,
} from '../bankAccounts/bankAccountNotifications.js';
import {
  deleteAllHistoryCandidates,
  refreshHistoryImportAggregates,
} from './bank-transaction-history.model.js';
import { HISTORY_IMPORT_REMINDER_DAYS } from './bank-transaction-history.types.js';

import type { BankTransactionHistoryImport } from './bank-transaction-history.types.js';

const logger = getLogger({ component: 'history-import-expiry' });

export interface HistoryImportExpirySweepResult {
  expiredCount: number;
  remindedCount: number;
  candidateRowsDeleted: number;
}

interface HistoryImportAccountContext {
  bankAccountId: string;
  bankAccountName: string;
  feedId: string;
  companyId: string;
}

/**
 * Per-feed transactions so one failure does not roll back the rest of the batch.
 */
export async function processHistoryImportExpirySweep({
  limit = 100,
}: {
  limit?: number;
} = {}): Promise<HistoryImportExpirySweepResult> {
  const remindedCount = await sendDueHistoryImportReminders({ limit });
  const expiry = await expireDueHistoryImports({ limit });
  return {
    expiredCount: expiry.expiredCount,
    remindedCount,
    candidateRowsDeleted: expiry.candidateRowsDeleted,
  };
}

export async function sendDueHistoryImportReminders({
  limit = 100,
}: {
  limit?: number;
} = {}): Promise<number> {
  const dueIds = await listDueReminderImportIds(limit);
  let remindedCount = 0;

  for (const id of dueIds) {
    const reminded = await knexClient.transaction(async (trx) => {
      const row = await trx('bank_transaction_history_imports')
        .where({ id })
        .whereNull('reminder_sent_at')
        .whereNotNull('expires_at')
        .where('expires_at', '>', trx.fn.now())
        .where(
          'expires_at',
          '<=',
          trx.raw(`now() + interval '${HISTORY_IMPORT_REMINDER_DAYS} days'`),
        )
        .andWhere((builder) => {
          builder.where({ status: 'available' }).orWhere((inner) => {
            inner
              .where({ status: 'selected' })
              .andWhere('transaction_count', '>', 0);
          });
        })
        .forUpdate()
        .skipLocked()
        .first<BankTransactionHistoryImport | undefined>('*');
      if (!row?.expires_at) return false;

      const context = await loadHistoryImportAccountContext(trx, row);
      if (!context) return false;

      await writeHistoryImportExpiringSoonNotifications(trx, {
        clientCompanyId: context.companyId,
        bankAccountId: context.bankAccountId,
        bankAccountName: context.bankAccountName,
        feedId: context.feedId,
        expiresAt: row.expires_at,
        stateVersion: row.expires_at,
      });

      const stamped = await trx('bank_transaction_history_imports')
        .where({ id: row.id })
        .whereNull('reminder_sent_at')
        .update({
          reminder_sent_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      return stamped > 0;
    });
    if (reminded) remindedCount += 1;
  }

  if (remindedCount > 0) {
    logger.info({ remindedCount }, 'History import expiry reminders sent');
  }
  return remindedCount;
}

export async function expireDueHistoryImports({
  limit = 100,
}: {
  limit?: number;
} = {}): Promise<{ expiredCount: number; candidateRowsDeleted: number }> {
  const dueIds = await listDueExpiryImportIds(limit);
  let expiredCount = 0;
  let candidateRowsDeleted = 0;

  for (const id of dueIds) {
    const result = await knexClient.transaction(async (trx) => {
      const row = await trx('bank_transaction_history_imports')
        .where({ id })
        .whereNotNull('expires_at')
        .where('expires_at', '<=', trx.fn.now())
        .andWhere((builder) => {
          builder.where({ status: 'available' }).orWhere((inner) => {
            inner
              .where({ status: 'selected' })
              .andWhere('transaction_count', '>', 0);
          });
        })
        .forUpdate()
        .skipLocked()
        .first<BankTransactionHistoryImport | undefined>('*');
      if (!row) return null;

      const priorStatus = row.status as 'available' | 'selected';
      const deleted = await deleteAllHistoryCandidates({
        bankAccountFeedId: row.bank_account_feed_id,
        trx,
      });

      await refreshHistoryImportAggregates({
        bankAccountFeedId: row.bank_account_feed_id,
        trx,
      });

      if (priorStatus === 'available') {
        await trx('bank_transaction_history_imports')
          .where({ id: row.id, status: 'available' })
          .update({
            status: 'expired',
            updated_at: trx.fn.now(),
          });
      } else if (deleted === 0) {
        return null;
      }

      if (deleted > 0 && row.expires_at) {
        const context = await loadHistoryImportAccountContext(trx, row);
        if (context) {
          await writeHistoryImportExpiredNotifications(trx, {
            clientCompanyId: context.companyId,
            bankAccountId: context.bankAccountId,
            bankAccountName: context.bankAccountName,
            feedId: context.feedId,
            expiresAt: row.expires_at,
            priorStatus,
            stateVersion: row.expires_at,
          });
        }
      } else if (priorStatus === 'available') {
        // Empty candidate set: still close attention, but skip "expired" noise.
        await resolveHistoryImportAttention(trx, {
          clientCompanyId: row.company_id,
          feedId: row.bank_account_feed_id,
          stateVersion: row.expires_at ?? new Date(),
        });
      }

      return { deleted };
    });

    if (!result) continue;
    expiredCount += 1;
    candidateRowsDeleted += result.deleted;
  }

  if (expiredCount > 0) {
    logger.info(
      { expiredCount, candidateRowsDeleted },
      'History import expiry sweep completed',
    );
  }
  return { expiredCount, candidateRowsDeleted };
}

function dueOfferStatusFilter(builder: Knex.QueryBuilder): Knex.QueryBuilder {
  return builder.where({ status: 'available' }).orWhere((inner) => {
    inner.where({ status: 'selected' }).andWhere('transaction_count', '>', 0);
  });
}

async function listDueReminderImportIds(limit: number): Promise<string[]> {
  const rows = await knexClient('bank_transaction_history_imports')
    .whereNull('reminder_sent_at')
    .whereNotNull('expires_at')
    .where('expires_at', '>', knexClient.fn.now())
    .where(
      'expires_at',
      '<=',
      knexClient.raw(`now() + interval '${HISTORY_IMPORT_REMINDER_DAYS} days'`),
    )
    .andWhere(dueOfferStatusFilter)
    .orderBy('expires_at', 'asc')
    .limit(limit)
    .select<{ id: string }[]>('id');
  return rows.map((row) => row.id);
}

async function listDueExpiryImportIds(limit: number): Promise<string[]> {
  const rows = await knexClient('bank_transaction_history_imports')
    .whereNotNull('expires_at')
    .where('expires_at', '<=', knexClient.fn.now())
    .andWhere(dueOfferStatusFilter)
    .orderBy('expires_at', 'asc')
    .limit(limit)
    .select<{ id: string }[]>('id');
  return rows.map((row) => row.id);
}

async function loadHistoryImportAccountContext(
  trx: Knex.Transaction,
  row: BankTransactionHistoryImport,
): Promise<HistoryImportAccountContext | null> {
  const feed = await trx('bank_account_feeds')
    .where({ id: row.bank_account_feed_id, company_id: row.company_id })
    .first<{ bank_account_id: string }>('bank_account_id');
  if (!feed) return null;

  const account = await trx('bank_accounts')
    .where({ id: feed.bank_account_id, company_id: row.company_id })
    .first<{ id: string; display_name: string }>('id', 'display_name');
  if (!account) return null;

  return {
    bankAccountId: account.id,
    bankAccountName: account.display_name,
    feedId: row.bank_account_feed_id,
    companyId: row.company_id,
  };
}
