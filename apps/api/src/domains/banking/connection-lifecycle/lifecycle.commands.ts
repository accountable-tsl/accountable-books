import type { Knex } from 'knex';

import { cancelPendingBankSync } from '../../../integrations/banking/transaction-sync.outbox.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  listFeedsForConnection,
  reactivateBankAccountFeed,
  stopBankAccountFeed,
} from '../bank-account-feeds/bank-account-feeds.model.js';
import {
  createBankConnectionSecret,
  destroyBankConnectionSecret,
  rotateBankConnectionSecret,
} from '../bank-connection-secrets/bank-connection-secrets.model.js';
import {
  reactivateBankConnection,
  revokeBankConnection,
} from '../bank-connections/bank-connections.model.js';

import type { ApiResponse } from '../../../core/types/api.types.js';

export async function stopFeedAndCancelSync({
  feedId,
  companyId,
  revokedById,
  revocationOrigin,
  revocationReason,
  trx,
}: {
  feedId: string;
  companyId: string;
  revokedById?: string | null;
  revocationOrigin: 'client' | 'provider';
  revocationReason?: string | null;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{ id: string; alreadyStopped: boolean; bankAccountId: string }>
> {
  const feed = await trx('bank_account_feeds')
    .where({ id: feedId, company_id: companyId })
    .first<{ id: string; bank_account_id: string }>('id', 'bank_account_id');
  if (!feed) {
    return errorResponse('Bank account feed not found', null);
  }

  const stopped = await stopBankAccountFeed({
    feedId,
    companyId,
    revokedById,
    revocationOrigin,
    revocationReason,
    trx,
  });
  if (!stopped.success || !stopped.data) {
    return stopped as ApiResponse<{
      id: string;
      alreadyStopped: boolean;
      bankAccountId: string;
    }>;
  }

  if (!stopped.data.alreadyStopped) {
    await cancelPendingBankSync({
      bankAccountId: feed.bank_account_id,
      trx,
    });
  }

  return successResponse(stopped.message, {
    id: stopped.data.id,
    alreadyStopped: stopped.data.alreadyStopped,
    bankAccountId: feed.bank_account_id,
  });
}

export async function revokeConnectionAndDestroySecret({
  connectionId,
  companyId,
  revokedById,
  revocationOrigin,
  revocationReason,
  trx,
}: {
  connectionId: string;
  companyId: string;
  revokedById?: string | null;
  revocationOrigin: 'client' | 'provider';
  revocationReason?: string | null;
  trx: Knex.Transaction;
}): Promise<
  ApiResponse<{
    id: string;
    alreadyRevoked: boolean;
    feedsStopped: number;
  }>
> {
  const feedsBefore = await listFeedsForConnection({
    connectionId,
    companyId,
    trx,
  });
  if (!feedsBefore.success || !feedsBefore.data) {
    return errorResponse('Failed to list feeds for connection', null);
  }

  const revoked = await revokeBankConnection({
    connectionId,
    companyId,
    revokedById,
    revocationOrigin,
    revocationReason,
    trx,
  });
  if (!revoked.success || !revoked.data) {
    return revoked;
  }

  if (!revoked.data.alreadyRevoked) {
    for (const feed of feedsBefore.data) {
      if (feed.revoked_at == null) {
        await cancelPendingBankSync({
          bankAccountId: feed.bank_account_id,
          trx,
        });
      }
    }
    await destroyBankConnectionSecret({
      connectionId,
      companyId,
      trx,
    });
  }

  return revoked;
}

export async function ensureActiveConnectionSecret({
  connectionId,
  companyId,
  accessToken,
  refreshToken,
  hadSecret,
  trx,
}: {
  connectionId: string;
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  /** When false, insert; when true, rotate in place. */
  hadSecret: boolean;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  if (hadSecret) {
    return rotateBankConnectionSecret({
      connectionId,
      companyId,
      accessToken,
      refreshToken,
      trx,
    });
  }
  return createBankConnectionSecret({
    connectionId,
    companyId,
    accessToken,
    refreshToken,
    trx,
  });
}

export async function reactivateConnectionForReauth({
  connectionId,
  companyId,
  updatedById,
  trx,
}: {
  connectionId: string;
  companyId: string;
  updatedById?: string | null;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  return reactivateBankConnection({
    connectionId,
    companyId,
    updatedById,
    trx,
  });
}

export async function reactivateFeedForReauth({
  feedId,
  companyId,
  trx,
}: {
  feedId: string;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  return reactivateBankAccountFeed({ feedId, companyId, trx });
}

export async function bumpActiveFeedStateVersions({
  connectionId,
  companyId,
  trx,
}: {
  connectionId: string;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<number> {
  return trx('bank_account_feeds')
    .where({
      bank_connection_id: connectionId,
      company_id: companyId,
    })
    .whereNull('revoked_at')
    .update({
      state_version: trx.raw('state_version + 1'),
      updated_at: trx.fn.now(),
    });
}
