import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { bankConnection, newBankConnection } from './bank-connections.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankConnection,
  BankConnectionAuthorizationStatus,
  NewBankConnection,
} from './bank-connections.types.js';

/** Ordinary connection selects never include secret columns. */
const CONNECTION_COLUMNS = [
  'id',
  'company_id',
  'provider_id',
  'provider_item_id',
  'bank_provider_mapping_id',
  'authorization_status',
  'authorization_reason_code',
  'requires_action_at',
  'connected_at',
  'connected_by_id',
  'revoked_at',
  'revoked_by_id',
  'revocation_origin',
  'revocation_reason',
  'provider_expires_at',
  'provider_snapshot',
  'provider_snapshot_version',
  'provider_snapshot_captured_at',
  'updated_at',
  'updated_by_id',
] as const;

export async function createBankConnection({
  data,
  trx,
}: {
  data: NewBankConnection;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const parsed = newBankConnection.safeParse(data);
  if (!parsed.success) {
    return errorResponse(
      'Invalid bank connection input',
      parsed.error.flatten(),
    );
  }

  const knex = trx ?? knexClient;
  try {
    const [row] = await knex('bank_connections')
      .insert({
        ...parsed.data,
        authorization_status: parsed.data.authorization_status ?? 'active',
        connected_at: parsed.data.connected_at ?? knex.fn.now(),
      })
      .returning<{ id: string }[]>('id');

    return successResponse('Bank connection created', { id: row.id });
  } catch (error) {
    return errorResponse('Failed to create bank connection', error);
  }
}

export async function getBankConnection({
  connectionId,
  companyId,
  trx,
}: {
  connectionId: string;
  companyId: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankConnection>> {
  const knex = trx ?? knexClient;
  try {
    const q = knex('bank_connections')
      .select(CONNECTION_COLUMNS)
      .where({ id: connectionId, company_id: companyId });

    const row = await q.first();
    if (!row) {
      return errorResponse('Bank connection not found', null);
    }
    const parsed = bankConnection.safeParse(row);
    if (!parsed.success) {
      return errorResponse(
        'Invalid bank connection row',
        parsed.error.flatten(),
      );
    }
    return successResponse('Bank connection retrieved', parsed.data);
  } catch (error) {
    return errorResponse('Failed to retrieve bank connection', error);
  }
}

async function updateBankConnectionAuthorization({
  connectionId,
  companyId,
  authorizationStatus,
  authorizationReasonCode,
  requiresActionAt,
  updatedById,
  trx,
}: {
  connectionId: string;
  companyId: string;
  authorizationStatus: Exclude<BankConnectionAuthorizationStatus, 'revoked'>;
  authorizationReasonCode?: string | null;
  requiresActionAt?: Date | null;
  updatedById?: string | null;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const knex = trx ?? knexClient;
  try {
    const patch: Record<string, unknown> = {
      authorization_status: authorizationStatus,
      updated_at: knex.fn.now(),
      updated_by_id: updatedById ?? null,
    };
    if (authorizationStatus === 'requires_action') {
      patch.requires_action_at = requiresActionAt ?? new Date();
      patch.authorization_reason_code = authorizationReasonCode ?? null;
    }
    if (authorizationStatus === 'active') {
      patch.requires_action_at = null;
      patch.authorization_reason_code = null;
    }
    const updated = await knex('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .update(patch);

    if (!updated) {
      return errorResponse('Bank connection not found', null);
    }
    return successResponse('Bank connection authorization updated', {
      id: connectionId,
    });
  } catch (error) {
    return errorResponse(
      'Failed to update bank connection authorization',
      error,
    );
  }
}

/** Sole authorization writer for requires_action; bumps active feed guards. */
export async function markConnectionRequiresAction({
  connectionId,
  companyId,
  reasonCode,
  updatedById,
  trx,
}: {
  connectionId: string;
  companyId: string;
  reasonCode: string;
  updatedById?: string | null;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string; feedsBumped: number }>> {
  const auth = await updateBankConnectionAuthorization({
    connectionId,
    companyId,
    authorizationStatus: 'requires_action',
    authorizationReasonCode: reasonCode,
    updatedById,
    trx,
  });
  if (!auth.success)
    return auth as ApiResponse<{ id: string; feedsBumped: number }>;

  const bumped = await trx('bank_account_feeds')
    .where({
      bank_connection_id: connectionId,
      company_id: companyId,
    })
    .whereNull('revoked_at')
    .update({
      state_version: trx.raw('state_version + 1'),
      updated_at: trx.fn.now(),
    });

  return successResponse('Connection requires action', {
    id: connectionId,
    feedsBumped: bumped,
  });
}
