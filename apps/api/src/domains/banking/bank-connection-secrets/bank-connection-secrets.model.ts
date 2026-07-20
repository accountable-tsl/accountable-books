import type { Knex } from 'knex';

import { knexClient } from '../../../db/knexClient.js';
import {
  decrypt,
  encrypt,
  getCiphertextKeyId,
} from '../../../shared/utils/crypto.utils.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { newBankConnectionSecret } from './bank-connection-secrets.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type { NewBankConnectionSecret } from './bank-connection-secrets.types.js';

const getSecretAad = ({
  connectionId,
  companyId,
}: {
  connectionId: string;
  companyId: string;
}) => `${connectionId}:${companyId}`;

export type DecryptedConnectionTokens = {
  bank_connection_id: string;
  access_token: string;
  refresh_token?: string;
  encryption_key_version: number;
};

async function loadConnectionSecret({
  connectionId,
  companyId,
  authorizationStatuses,
  providerKey,
  unavailableMessage,
  trx,
}: {
  connectionId: string;
  companyId: string;
  authorizationStatuses: Array<'active' | 'requires_action'>;
  providerKey?: string;
  unavailableMessage: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<DecryptedConnectionTokens>> {
  const knex = trx ?? knexClient;
  try {
    const query = knex('bank_connection_secrets as bcs')
      .join('bank_connections as bc', 'bc.id', 'bcs.bank_connection_id')
      .where({
        'bcs.bank_connection_id': connectionId,
        'bc.company_id': companyId,
      })
      .whereIn('bc.authorization_status', authorizationStatuses);

    if (providerKey) {
      query
        .join('bank_feed_providers as bfp', 'bfp.id', 'bc.provider_id')
        .where('bfp.key', providerKey);
    }

    const row = await query
      .select(
        'bcs.bank_connection_id',
        'bcs.encrypted_access_token',
        'bcs.encrypted_refresh_token',
        'bcs.encryption_key_version',
      )
      .first<{
        bank_connection_id: string;
        encrypted_access_token: string;
        encrypted_refresh_token: string | null;
        encryption_key_version: number;
      }>();

    if (!row?.encrypted_access_token) {
      return errorResponse(unavailableMessage, null);
    }

    const aad = getSecretAad({ connectionId, companyId });
    return successResponse('Connection secret loaded', {
      bank_connection_id: row.bank_connection_id,
      access_token: decrypt(row.encrypted_access_token, aad),
      ...(row.encrypted_refresh_token
        ? { refresh_token: decrypt(row.encrypted_refresh_token, aad) }
        : {}),
      encryption_key_version: row.encryption_key_version,
    });
  } catch (error) {
    return errorResponse('Failed to load connection secret', error);
  }
}

export async function createBankConnectionSecret({
  connectionId,
  companyId,
  accessToken,
  refreshToken,
  trx,
}: {
  connectionId: string;
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  const execute = async (knex: Knex.Transaction) => {
    const connection = await knex('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .first('id');
    if (!connection) {
      return errorResponse<{ id: string }>(
        'Bank connection not found for company',
        null,
      );
    }

    const aad = getSecretAad({ connectionId, companyId });
    const encryptedAccessToken = encrypt(accessToken, aad);
    const row: NewBankConnectionSecret = {
      bank_connection_id: connectionId,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: refreshToken ? encrypt(refreshToken, aad) : null,
      encryption_key_version: getCiphertextKeyId(encryptedAccessToken),
    };
    const parsed = newBankConnectionSecret.safeParse(row);
    if (!parsed.success) {
      return errorResponse<{ id: string }>(
        'Invalid connection secret input',
        parsed.error.flatten(),
      );
    }

    const [created] = await knex('bank_connection_secrets')
      .insert({ ...parsed.data, rotated_at: knex.fn.now() })
      .returning<{ id: string }[]>('id');
    return successResponse('Bank connection secret created', {
      id: created.id,
    });
  };

  try {
    return trx ? await execute(trx) : await knexClient.transaction(execute);
  } catch (error) {
    return errorResponse('Failed to create bank connection secret', error);
  }
}

/** Provider execution is available only while the owning connection is active. */
export async function loadSecretForProviderExecution({
  connectionId,
  companyId,
  trx,
}: {
  connectionId: string;
  companyId: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<DecryptedConnectionTokens>> {
  return loadConnectionSecret({
    connectionId,
    companyId,
    authorizationStatuses: ['active'],
    unavailableMessage: 'Connection secret unavailable for provider execution',
    trx,
  });
}

export async function loadSecretForConnectionReauthorization({
  connectionId,
  companyId,
  providerKey,
  trx,
}: {
  connectionId: string;
  companyId: string;
  providerKey: string;
  trx?: Knex | Knex.Transaction;
}): Promise<ApiResponse<DecryptedConnectionTokens>> {
  return loadConnectionSecret({
    connectionId,
    companyId,
    authorizationStatuses: ['active', 'requires_action'],
    providerKey,
    unavailableMessage: 'Connection secret unavailable for reauthorization',
    trx,
  });
}

/**
 * Overwrites ciphertext for an existing secret row. Active connection must
 * retain exactly one secret; never insert a second row.
 */
export async function rotateBankConnectionSecret({
  connectionId,
  companyId,
  accessToken,
  refreshToken,
  trx,
}: {
  connectionId: string;
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  try {
    const connection = await trx('bank_connections')
      .where({
        id: connectionId,
        company_id: companyId,
        authorization_status: 'active',
      })
      .first('id');
    if (!connection) {
      return errorResponse(
        'Active bank connection not found for company',
        null,
      );
    }

    const aad = getSecretAad({ connectionId, companyId });
    const encryptedAccessToken = encrypt(accessToken, aad);
    const updated = await trx('bank_connection_secrets')
      .where({ bank_connection_id: connectionId })
      .update({
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: refreshToken
          ? encrypt(refreshToken, aad)
          : null,
        encryption_key_version: getCiphertextKeyId(encryptedAccessToken),
        rotated_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    if (!updated) {
      return errorResponse('Connection secret not found to rotate', null);
    }

    const row = await trx('bank_connection_secrets')
      .where({ bank_connection_id: connectionId })
      .first<{ id: string }>('id');
    return successResponse('Bank connection secret rotated', {
      id: row!.id,
    });
  } catch (error) {
    return errorResponse('Failed to rotate bank connection secret', error);
  }
}

/** Idempotent: deleting an already-missing secret succeeds. */
export async function destroyBankConnectionSecret({
  connectionId,
  companyId,
  trx,
}: {
  connectionId: string;
  companyId: string;
  trx: Knex.Transaction;
}): Promise<ApiResponse<{ destroyed: boolean }>> {
  try {
    const connection = await trx('bank_connections')
      .where({ id: connectionId, company_id: companyId })
      .first('id');
    if (!connection) {
      return errorResponse('Bank connection not found for company', null);
    }

    const deleted = await trx('bank_connection_secrets')
      .where({ bank_connection_id: connectionId })
      .delete();

    return successResponse('Bank connection secret destroyed', {
      destroyed: deleted > 0,
    });
  } catch (error) {
    return errorResponse('Failed to destroy bank connection secret', error);
  }
}
