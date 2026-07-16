import { format } from 'date-fns';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { getBankAccountFeed } from '../bank-account-feeds/bank-account-feeds.model.js';
import { importFinalizedFeedTransactions } from '../bank-feed-import/import-feed-transactions.js';
import {
  deleteHistoryCandidates,
  getHistoryImportForFeed,
  listCandidatesFromDate,
  markHistoryImportStatus,
  refreshHistoryImportAggregates,
} from './bank-transaction-history.model.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { FinalizedFeedTransaction } from '../bank-feed-import/import-feed-transactions.js';
import type { BankTransactionHistoryCandidate } from './bank-transaction-history.types.js';

const PROMOTION_CHUNK_SIZE = 500;

function candidateToFinalized(
  candidate: BankTransactionHistoryCandidate,
): FinalizedFeedTransaction {
  return {
    providerTransactionId: candidate.provider_transaction_id,
    transactionDate: candidate.transaction_date,
    transactionAt: candidate.transaction_at,
    amount: Number(candidate.amount),
    description: candidate.description,
    payee: candidate.payee,
    additionalNotes: candidate.additional_notes,
    providerEvidence: candidate.provider_evidence,
  };
}

export async function promoteBankTransactionHistory({
  companyId,
  bankAccountId,
  feedId,
  fromDate,
  userId,
}: {
  companyId: string;
  bankAccountId: string;
  feedId: string;
  /** yyyy-MM-dd */
  fromDate: string;
  userId: string;
}): Promise<ApiResponse<{ promotedCount: number; fromDate: string }>> {
  try {
    return await knexClient.transaction(async (trx) => {
      const feedResult = await getBankAccountFeed({
        feedId,
        companyId,
        forUpdate: true,
        trx,
      });
      if (!feedResult.success || !feedResult.data) {
        return errorResponse('Bank account feed not found', null);
      }
      const feed = feedResult.data;
      if (feed.bank_account_id !== bankAccountId) {
        return errorResponse('Feed does not belong to this bank account', null);
      }

      const historyImport = await getHistoryImportForFeed({
        bankAccountFeedId: feedId,
        companyId,
        forUpdate: true,
        trx,
      });
      if (!historyImport) {
        return errorResponse('No history import found for this account', null);
      }

      if (!['available', 'selected'].includes(historyImport.status)) {
        return errorResponse(
          `History import is not available for promotion (status: ${historyImport.status})`,
          null,
        );
      }

      if (
        !historyImport.earliest_transaction_date ||
        !historyImport.latest_transaction_date ||
        historyImport.transaction_count < 1
      ) {
        return errorResponse(
          'History import has no observed candidate range to promote',
          null,
        );
      }

      const earliestYmd = format(
        historyImport.earliest_transaction_date,
        'yyyy-MM-dd',
      );
      const latestYmd = format(
        historyImport.latest_transaction_date,
        'yyyy-MM-dd',
      );
      if (fromDate < earliestYmd || fromDate > latestYmd) {
        return errorResponse(
          `fromDate must be within the observed history range (${earliestYmd} to ${latestYmd})`,
          null,
        );
      }

      if (!feed.sync_from_date) {
        return errorResponse('Feed has no sync boundary date', null);
      }
      const boundaryYmd = format(feed.sync_from_date, 'yyyy-MM-dd');
      if (fromDate >= boundaryYmd) {
        return errorResponse(
          `fromDate must be before the current sync boundary (${boundaryYmd})`,
          null,
        );
      }

      const candidates = await listCandidatesFromDate({
        bankAccountFeedId: feedId,
        companyId,
        fromDate,
        trx,
      });

      let promotedCount = 0;
      for (
        let offset = 0;
        offset < candidates.length;
        offset += PROMOTION_CHUNK_SIZE
      ) {
        const chunk = candidates.slice(offset, offset + PROMOTION_CHUNK_SIZE);
        const imported = await importFinalizedFeedTransactions(trx, {
          companyId,
          userId,
          bankAccountId,
          feedId,
          syncRunId: null,
          fingerprintContext: `history_promotion:${historyImport.id}:${fromDate}`,
          transactions: chunk.map(candidateToFinalized),
        });
        promotedCount += imported.importedCount;

        for (const candidate of chunk) {
          if (!candidate.supersedes_bank_transaction_id) continue;
          const replacementId =
            imported.bankTransactionIdByProviderId.get(
              candidate.provider_transaction_id,
            ) ?? null;
          if (!replacementId) continue;
          await trx('bank_transactions')
            .where({
              id: candidate.supersedes_bank_transaction_id,
              bank_account_id: bankAccountId,
              company_id: companyId,
            })
            .whereNull('superseded_by_bank_transaction_id')
            .update({
              superseded_by_bank_transaction_id: replacementId,
              updated_at: trx.fn.now(),
            });
        }

        await deleteHistoryCandidates({
          bankAccountFeedId: feedId,
          providerTransactionIds: chunk.map(
            (candidate) => candidate.provider_transaction_id,
          ),
          trx,
        });
      }

      await refreshHistoryImportAggregates({
        bankAccountFeedId: feedId,
        trx,
      });

      const updated = await trx('bank_account_feeds')
        .where({
          id: feedId,
          company_id: companyId,
          state_version: feed.state_version,
        })
        .whereNull('revoked_at')
        .update({
          sync_from_date: fromDate,
          state_version: feed.state_version + 1,
          updated_at: trx.fn.now(),
        });
      if (!updated) {
        throw new Error('Failed to update feed sync boundary (CAS miss)');
      }

      await markHistoryImportStatus({
        bankAccountFeedId: feedId,
        companyId,
        status: 'selected',
        selection: { fromDate, selectedById: userId },
        trx,
      });

      return successResponse('History promoted successfully', {
        promotedCount,
        fromDate,
      });
    });
  } catch (error) {
    return errorResponse('Failed to promote bank transaction history', error);
  }
}
