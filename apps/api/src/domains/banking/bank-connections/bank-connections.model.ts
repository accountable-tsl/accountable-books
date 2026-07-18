import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { bankProviderKey } from '../bankFeedProviders/bankFeedProviders.types.js';
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

export async function getBankConnectionReauthorizationContext({
  connectionId,
  companyId,
}: {
  connectionId: string;
  companyId: string;
}): Promise<
  ApiResponse<{
    providerKey: 'plaid' | 'mono';
    providerItemId: string | null;
    countryCode: string;
    bankId: string;
  }>
> {
  try {
    const row = await knexClient('bank_connections as bc')
      .join('bank_feed_providers as bfp', 'bfp.id', 'bc.provider_id')
      .join('companies as company', 'company.id', 'bc.company_id')
      .join(
        'countries as company_country',
        'company_country.id',
        'company.country_id',
      )
      .leftJoin(
        'bank_provider_mappings as bpm',
        'bpm.id',
        'bc.bank_provider_mapping_id',
      )
      .leftJoin('banks as bank', 'bank.id', 'bpm.bank_id')
      .leftJoin(
        'countries as bank_country',
        'bank_country.id',
        'bank.country_id',
      )
      .leftJoin(
        'bank_account_feeds as feed',
        'feed.bank_connection_id',
        'bc.id',
      )
      .leftJoin('bank_accounts as account', 'account.id', 'feed.bank_account_id')
      .leftJoin(
        'banks as account_bank',
        'account_bank.id',
        'account.bank_id',
      )
      .leftJoin(
        'countries as account_bank_country',
        'account_bank_country.id',
        'account_bank.country_id',
      )
      .where({ 'bc.id': connectionId, 'bc.company_id': companyId })
      .first<{
        provider_key: string;
        provider_item_id: string | null;
        authorization_status: string;
        country_code: string;
        bank_id: string | null;
      }>(
        'bfp.key as provider_key',
        'bc.provider_item_id',
        'bc.authorization_status',
        knexClient.raw('COALESCE(bank.id, account_bank.id) as bank_id'),
        knexClient.raw(
          'COALESCE(bank_country.code, account_bank_country.code, company_country.code) as country_code',
        ),
      );

    if (!row || row.authorization_status === 'revoked') {
      return errorResponse('Bank connection cannot be reauthorized', null, {
        code: ErrorCode.OPERATION_NOT_ALLOWED,
      });
    }
    const parsedProviderKey = bankProviderKey.safeParse(row.provider_key);
    if (!parsedProviderKey.success) {
      return errorResponse('Bank connection provider is unsupported', null, {
        code: ErrorCode.SERVICE_UNAVAILABLE,
      });
    }
    if (!row.bank_id) {
      return errorResponse('Bank connection institution is unavailable', null, {
        code: ErrorCode.DATABASE_ERROR,
      });
    }
    return successResponse('Bank connection reauthorization context loaded', {
      providerKey: parsedProviderKey.data,
      providerItemId: row.provider_item_id,
      countryCode: row.country_code,
      bankId: row.bank_id,
    });
  } catch (error) {
    return errorResponse(
      'Failed to load bank connection reauthorization context',
      error,
      { code: ErrorCode.DATABASE_ERROR, report: true },
    );
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

export async function findBankConnectionByProviderItem({
  companyId,
  providerId,
  providerItemId,
  trx,
}: {
  companyId: string;
  providerId: string;
  providerItemId: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankConnection | null>> {
  const knex = trx ?? knexClient;
  try {
    const row = await knex('bank_connections')
      .select(CONNECTION_COLUMNS)
      .where({
        company_id: companyId,
        provider_id: providerId,
        provider_item_id: providerItemId,
      })
      .first();
    if (!row) {
      return successResponse('No connection for provider item', null);
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
    return errorResponse(
      'Failed to find bank connection by provider item',
      error,
    );
  }
}

export async function revokeBankConnection({
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
  ApiResponse<{ id: string; alreadyRevoked: boolean; feedsStopped: number }>
> {
  try {
    const connection = await trx('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .forUpdate()
      .first<{
        id: string;
        authorization_status: string;
      }>('id', 'authorization_status');
    if (!connection) {
      return errorResponse('Bank connection not found', null);
    }

    if (connection.authorization_status === 'revoked') {
      return successResponse('Bank connection already revoked', {
        id: connectionId,
        alreadyRevoked: true,
        feedsStopped: 0,
      });
    }

    const feedsStopped = await trx('bank_account_feeds')
      .where({
        bank_connection_id: connectionId,
        company_id: companyId,
      })
      .whereNull('revoked_at')
      .update({
        revoked_at: trx.fn.now(),
        revoked_by_id: revokedById ?? null,
        revocation_origin: revocationOrigin,
        revocation_reason: revocationReason ?? null,
        state_version: trx.raw('state_version + 1'),
        updated_at: trx.fn.now(),
      });

    await trx('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .update({
        authorization_status: 'revoked',
        requires_action_at: null,
        authorization_reason_code: null,
        revoked_at: trx.fn.now(),
        revoked_by_id: revokedById ?? null,
        revocation_origin: revocationOrigin,
        revocation_reason: revocationReason ?? null,
        updated_at: trx.fn.now(),
        updated_by_id: revokedById ?? null,
      });

    return successResponse('Bank connection revoked', {
      id: connectionId,
      alreadyRevoked: false,
      feedsStopped,
    });
  } catch (error) {
    return errorResponse('Failed to revoke bank connection', error);
  }
}

/** Clears revoke / requires_action and returns the connection to active. */
export async function reactivateBankConnection({
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
  try {
    const updated = await trx('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .update({
        authorization_status: 'active',
        requires_action_at: null,
        authorization_reason_code: null,
        revoked_at: null,
        revoked_by_id: null,
        revocation_origin: null,
        revocation_reason: null,
        updated_at: trx.fn.now(),
        updated_by_id: updatedById ?? null,
      });
    if (!updated) {
      return errorResponse('Bank connection not found', null);
    }
    return successResponse('Bank connection reactivated', { id: connectionId });
  } catch (error) {
    return errorResponse('Failed to reactivate bank connection', error);
  }
}
