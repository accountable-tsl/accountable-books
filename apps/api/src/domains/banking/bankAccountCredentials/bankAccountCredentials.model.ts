import type { Knex } from 'knex';
import {
  newBankAccountCredentialInput,
  type NewBankAccountCredentialInput,
} from './bankAccountCredentials.types.js';
import { errorResponse, successResponse } from 'src/shared/utils/response.utils.js';
import { getCompanyUUID } from 'src/shared/utils/random.utils.js';
import { knexClient } from 'src/db/knexClient.js';
import { encrypt } from 'src/shared/utils/crypto.utils.js';

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
    return errorResponse('Invalid input provided', validatedInput.error.flatten());
  }

  const v = validatedInput.data;
  const knex = trx ? trx : knexClient;

  const aad = getBankAccountCredentialAAD({
    providerId: v.provider_id,
    companyId: companyId,
  });
  const encryptedAccessToken = encrypt(v.access_token, aad);
  const encryptedRefreshToken = v.refresh_token ? encrypt(v.refresh_token, aad) : null;
  const { access_token, refresh_token, ...rest } = v.raw_metadata ?? v;
  const rawMetadata = { ...rest, access_token: '[REDACTED]', refresh_token: '[REDACTED]' };
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      throw new Error('Company not found');
    }

    const [credential] = await knex('bank_account_credentials')
      .insert({
        company_id: companyUUID,
        item_identifier: v.item_identifier,
        encrpyted_access_token: encryptedAccessToken,
        ...(refresh_token ? { encrpyted_refresh_token: encryptedRefreshToken } : {}),
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

    return successResponse('Bank account credential created', { id: credential.id });
  } catch (error) {
    return errorResponse('Failed to create bank account credential', error);
  }
};
