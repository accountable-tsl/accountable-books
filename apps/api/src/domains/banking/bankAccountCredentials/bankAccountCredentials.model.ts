import type { Knex } from 'knex';
import {
  newBankAccountCredentialInput,
  type BankAccountCredential,
  type NewBankAccountCredentialInput,
} from './bankAccountCredentials.types.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import { getCompanyUUID } from '../../../shared/utils/random.utils.js';
import { knexClient } from '../../../db/knexClient.js';
import { decrypt, encrypt } from '../../../shared/utils/crypto.utils.js';
import type { ApiResponse } from '../../../core/types/api.types.js';

const getBankAccountCredentialAAD = ({
  providerId,
  companyId,
}: {
  providerId: string;
  companyId: string;
}) => {
  return `${providerId}:${companyId}`;
};

export const createBankAccountCredential = async ({
  data,
  userId,
  companyId,
  trx,
}: {
  data: NewBankAccountCredentialInput;
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}) => {
  const validatedInput = newBankAccountCredentialInput.safeParse(data);
  if (!validatedInput.success) {
    return errorResponse(
      'Invalid input provided',
      validatedInput.error.flatten(),
    );
  }

  const v = validatedInput.data;
  const knex = trx ? trx : knexClient;

  const companyUUID = await getCompanyUUID(companyId);
  if (!companyUUID) {
    throw new Error('Company not found');
  }

  const aad = getBankAccountCredentialAAD({
    providerId: v.provider_id,
    companyId: companyUUID,
  });
  const encryptedAccessToken = encrypt(v.access_token, aad);
  const encryptedRefreshToken = v.refresh_token
    ? encrypt(v.refresh_token, aad)
    : null;
  const { access_token, refresh_token, ...rest } = v.raw_metadata ?? v;
  const rawMetadata = {
    ...rest,
    access_token: '[REDACTED]',
    refresh_token: '[REDACTED]',
  };
  try {
    const [credential] = await knex('bank_account_credentials')
      .insert({
        company_id: companyUUID,
        item_identifier: v.item_identifier,
        encrypted_access_token: encryptedAccessToken,
        ...(encryptedRefreshToken
          ? { encrypted_refresh_token: encryptedRefreshToken }
          : {}),
        institution_id: v.institution_id,
        institution_name: v.institution_name,
        raw_metadata: rawMetadata,
        status: v.status,
        ...(v.expires_at ? { expires_at: v.expires_at } : {}),
        provider_id: v.provider_id,
        connected_by: userId,
        updated_by: userId,
      })
      .returning<{ id: string }[]>('id');

    return successResponse('Bank account credential created', {
      id: credential.id,
    });
  } catch (error) {
    return errorResponse('Failed to create bank account credential', error);
  }
};

type DecryptedBankAccountCredential = BankAccountCredential & {
  access_token: string;
  refresh_token?: string;
};

export async function getBankAccountCredential<T extends boolean>({
  credentialId,
  decryptToken = false as T,
  activeStatusOnly = true,
  trx,
}: {
  credentialId: string;
  activeStatusOnly?: boolean;
  decryptToken?: T;
  trx?: Knex | Knex.Transaction;
}): Promise<
  ApiResponse<
    T extends true ? DecryptedBankAccountCredential : BankAccountCredential
  >
> {
  const knex = trx || knexClient;

  if (!credentialId) {
    throw new Error('Credential ID is required');
  }
  try {
    let query = knex('bank_account_credentials as bac').where(
      'id',
      credentialId,
    );

    if (activeStatusOnly) {
      query = query.where('status', 'active');
    }

    const cred = await query.select('*').first();
    if (!cred) throw new Error('Credential not found');
    if (decryptToken) {
      const aad = getBankAccountCredentialAAD({
        providerId: cred.provider_id,
        companyId: cred.company_id,
      });
      const newCred: DecryptedBankAccountCredential = {
        ...cred,
        access_token: decrypt(cred.encrypted_access_token, aad),
        ...(cred.encrypted_refresh_token
          ? { refresh_token: decrypt(cred.encrypted_refresh_token, aad) }
          : {}),
      };
      return successResponse('Credential retrieved successfully', newCred);
    }
    return successResponse('Credential retrieved successfully', cred);
  } catch (error) {
    console.error('Credential lookup failed:', {
      credentialId,
      activeStatusOnly,
      error: error instanceof Error ? error.message : error,
    });
    return errorResponse('Unable to retrieve credential', error);
  }
}

/**
 * Get all active credentials for periodic sync scheduling
 */
export async function getAllActiveCredentials(trx?: Knex.Transaction): Promise<
  {
    id: string;
    company_id: string;
    provider_id: string;
    status: string;
  }[]
> {
  const knex = trx || knexClient;

  return await knex('bank_account_credentials')
    .select(['id', 'company_id', 'provider_id', 'status'])
    .where('status', 'active')
    .orderBy('connected_at', 'desc');
}
// export async function getBankAccountCredential({
//   credentialId,
//   decryptToken = false,
//   activeStatusOnly = true,
//   trx,
// }: {
//   credentialId: string;
//   activeStatusOnly?: boolean;
//   decryptToken?: boolean;
//   trx?: Knex | Knex.Transaction;
// }) {
//   const knex = trx || knexClient;

//   if (!credentialId) {
//     throw new Error('Credential ID is required');
//   }
//   try {
//     const query = knex('bank_account_credentials as bac').where('id', credentialId);

//     if (activeStatusOnly) {
//       query.where('status', 'active');
//     }

//     const cred = await query.first<BankAccountCredential>();
//     if (!cred) throw new Error('Credential not found');
//     if (decryptToken) {
//       const aad = getBankAccountCredentialAAD({
//         providerId: cred.provider_id,
//         companyId: cred.company_id,
//       });
//       const newCred: DecryptedBankAccountCredential = {
//         ...cred,
//         access_token: decrypt(cred.encrypted_access_token, aad),
//         ...(cred.encrypted_refresh_token
//           ? { refresh_token: decrypt(cred.encrypted_refresh_token, aad) }
//           : {}),
//       };
//       return successResponse<DecryptedBankAccountCredential>(
//         'Credential retrieved successfully',
//         newCred,
//       );
//     }
//     return successResponse<BankAccountCredential>('Credential retrieved successfully', cred);
//   } catch (error) {
//     return errorResponse('Unable to retrieve credential', error);
//   }
// }
