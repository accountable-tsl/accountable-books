import type { Knex } from 'knex';
import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import type { NewCompanyBankCredentialInput } from './banking.types.js';
import { getCompanyUUID } from 'src/shared/utils/random.utils.js';
import { decrypt, encrypt } from 'src/shared/utils/crypto.utils.js';
import { getBankFeedProviders } from '../bankFeedProviders/bankFeedProviders.model.js';
import { logger, logError } from '../../shared/utils/logger.js';

// Cache for provider lookups to reduce DB calls
const providerCache = new Map<string, string>(); // providerKey -> providerId

const getCompanyBankCredentialAAD = ({
  providerId,
  companyId,
}: {
  providerId: string;
  companyId: string;
}) => {
  return `${providerId}:${companyId}`;
};

export const createCompanyBankCredential = async (
  input: NewCompanyBankCredentialInput,
  trx?: Knex.Transaction,
): Promise<ApiResponse<{ id: string }>> => {
  try {
    logger.info(
      {
        companyId: input.companyId,
        provider: input.providerKey,
        operation: 'createBankCredential',
      },
      'Creating bank credential',
    );

    const execute = async (tx: Knex.Transaction) => {
      const companyUUID = await getCompanyUUID(input.companyId);
      if (!companyUUID) {
        throw new Error('Company ID is required');
      }

      let providerId = providerCache.get(input.providerKey);
      if (!providerId) {
        const provider = await getBankFeedProviders({ providerKeys: [input.providerKey] });
        if (!provider || !provider.success || !provider.data?.[0]) {
          throw new Error(`Provider '${input.providerKey}' not found or inactive`);
        }
        providerId = provider.data[0].id;
        providerCache.set(input.providerKey, providerId);
        logger.debug(
          {
            providerKey: input.providerKey,
            providerId,
            operation: 'cacheProviderLookup',
          },
          'Cached provider lookup',
        );
      }

      // This might not be a good idea, are we saying every company will only have one active credential per provider, that's a bad assumption?
      // // Check for existing active credentials (only fetch ID for efficiency)
      // const existing = await tx('company_bank_credentials')
      //   .where({
      //     company_id: companyUUID,
      //     provider_id: providerId,
      //     status: 'active',
      //   })
      //   .first('id');

      // if (existing) {
      //   return successResponse('Credential already exists', { id: existing.id });
      // }

      const aad = getCompanyBankCredentialAAD({
        providerId: providerId,
        companyId: companyUUID,
      });
      const encryptedToken = encrypt(input.token, aad);
      // Insert the credential
      const [credential] = await tx('company_bank_credentials')
        .insert({
          company_id: companyUUID,
          provider_id: providerId,
          identifier: input.identifier,
          encrypted_token: encryptedToken,
          raw_credentials: input.rawData,
          status: input.status || 'active',
          connected_by: input.userId,
          updated_by: input.userId,
          first_connected_at: new Date(),
          last_connected_at: new Date(),
        })
        .returning('id');

      logger.info(
        {
          companyId: input.companyId,
          provider: input.providerKey,
          credentialId: credential.id,
          operation: 'createBankCredential',
        },
        'Bank credential created successfully',
      );

      return successResponse('Credential created', { id: credential.id });
    };

    return trx ? await execute(trx) : await knexClient.transaction(execute);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logError(error, {
        companyId: input.companyId,
        provider: input.providerKey,
        operation: 'createBankCredential',
      });
    }
    return errorResponse('Failed to create credential', error);
  }
};

export const getDecryptedToken = async ({
  companyId,
  providerKey,
}: {
  companyId: string;
  providerKey: string;
}): Promise<{ success: boolean; token?: string; error?: unknown }> => {
  try {
    const companyUUID = await getCompanyUUID(companyId);
    if (!companyUUID) {
      throw new Error('Company not found');
    }

    // Use cache for provider lookup
    let providerId = providerCache.get(providerKey);
    if (!providerId) {
      const provider = await getBankFeedProviders({ providerKeys: [providerKey] });
      if (!provider.success || !provider.data?.[0]) {
        throw new Error(`Provider '${providerKey}' not found`);
      }
      providerId = provider.data[0].id;
      providerCache.set(providerKey, providerId);
    }

    // Only fetch the encrypted token (not all columns)
    const credential = await knexClient('company_bank_credentials')
      .where({ company_id: companyUUID, provider_id: providerId, status: 'active' })
      .first('encrypted_token');

    if (!credential) {
      throw new Error(`No active ${providerKey} connection found for company`);
    }

    const aad = getCompanyBankCredentialAAD({ providerId, companyId: companyUUID });
    const token = decrypt(credential.encrypted_token, aad);

    return { success: true, token };
  } catch (error: any) {
    logError(error, {
      companyId,
      providerKey,
      operation: 'getDecryptedToken',
    });
    return { success: false, error };
  }
};

// Helper function to clear provider cache (useful for tests or provider updates)
export const clearProviderCache = (): void => {
  providerCache.clear();
};
