import type { Knex } from 'knex';
import z from 'zod';

import { knexClient } from '../../../db/knexClient.js';
import { getCountryByCode } from '../../../domains/countries/countries.model.js';
import { refreshProviderRegistry } from '../../../integrations/banking/providers/registry.js';
import { redis } from '../../../lib/redis.js';
import {
  errorResponse,
  successResponse,
} from '../../../shared/utils/response.utils.js';
import {
  bankFeedProviderInputCamel,
  updateProviderInput,
} from './bankFeedProviders.types.js';

import type { ApiResponse } from '../../../core/types/api.types.js';
import type {
  BankFeedProviderInputCamel,
  BankFeedProviderStatus,
  BankFeedProviderWithCountries,
  BankProviderKey,
  RawBankFeedProviderResponse,
  UpdateProviderInput,
} from './bankFeedProviders.types.js';

const TTL = 60 * 60 * 1; // 1 hour
export async function invalidateBankFeedProvidersCache(providerIds?: string[]) {
  try {
    const pattern = 'bank_feed_providers:*';
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Also refresh the provider registry since it depends on this data
    await refreshProviderRegistry();
  } catch (error) {
    console.warn('Cache invalidation failed:', error);
  }
}

export async function addBankFeedProvider({
  userId,
  input,
  knex = knexClient,
}: {
  userId: string;
  input: BankFeedProviderInputCamel;
  knex?: Knex | Knex.Transaction;
}): Promise<ApiResponse<{ id: string }>> {
  // Validate input
  const validate = bankFeedProviderInputCamel.safeParse(input);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const { countries: providerCountryCodes, ...providerData } = validate.data;

  // For each entry, we need to insert the provider and then insert the provider-to-country mappings
  // both must succeed or both must fail
  const exec = async (trx: Knex.Transaction) => {
    const [provider] = await trx('bank_feed_providers')
      .insert({
        ...providerData,
        created_by_id: userId,
        updated_by_id: userId,
      })
      .onConflict('key')
      .ignore()
      .returning<{ id: string }[]>('id');

    if (!provider || !provider.id) {
      throw new Error(`Failed to create provider with key ${providerData.key}`);
    }

    // get provider country IDs
    for (const countryCode of providerCountryCodes) {
      const country = await getCountryByCode(countryCode);

      if (!country || !country.data || !country.data.id) {
        throw new Error(`Failed to get country with code ${countryCode}`);
      }

      await trx('bank_feed_provider_countries').insert({
        bank_feed_provider_id: provider.id,
        country_id: country.data.id,
        active: true,
        created_by_id: userId,
        updated_by_id: userId,
      });
    }
    await invalidateBankFeedProvidersCache();
    return successResponse('Provider successfully created', provider);
  };

  try {
    if (knex.isTransaction) {
      return await exec(knex as Knex.Transaction);
    }
    return await knexClient.transaction(exec);
  } catch (error: any) {
    if (error.code === '23505') {
      return errorResponse('Provider key must be unique', error.detail);
    }
    return errorResponse('Unknown error occurred', error);
  }
}

export async function getBankFeedProviders({
  providerIds,
  providerKeys,
  status = ['active'],
  useCache = true,
  trx,
}: {
  providerIds?: string[];
  providerKeys?: BankProviderKey[];
  status?: BankFeedProviderStatus[];
  useCache?: boolean;
  trx?: Knex.Transaction;
} = {}): Promise<ApiResponse<BankFeedProviderWithCountries[]>> {
  if (trx && useCache) {
    console.warn('Cache disabled when using transactions');
    useCache = false;
  }

  try {
    // Generate cache key
    const cacheKey = `bank_feed_providers:${JSON.stringify({
      ids: providerIds?.sort() || [],
      keys: providerKeys?.sort() || [],
      status: status.sort(),
    })}`;

    // Try to get from cache first
    if (useCache) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          return successResponse('Providers fetched (cached)', data);
        }
      } catch (cacheError) {
        console.error({ cacheError });
      }
    }

    const selectFields = [
      'p.id as id',
      'p.key as key',
      'p.display_name as name',
      'p.description as description',
      'p.website as website',
      'p.logo_url as logoUrl',
      'p.status as status',
      'c.id as countryId',
      'c.code as countryCode',
    ];

    const knex = trx || knexClient;
    const query = knex('bank_feed_providers as p')
      .select(selectFields)
      .innerJoin(
        'bank_feed_provider_countries as bpc',
        'p.id',
        'bpc.bank_feed_provider_id',
      )
      .innerJoin('countries as c', 'bpc.country_id', 'c.id')
      .whereIn('p.status', status)
      .where('bpc.active', true)
      .orderBy('p.display_name', 'asc')
      .orderBy('p.key', 'asc')
      .orderBy('c.id', 'asc');

    if (providerIds?.length) {
      query.whereIn('p.id', providerIds);
    }
    if (providerKeys?.length) {
      query.whereIn('p.key', providerKeys);
    }

    const result: RawBankFeedProviderResponse[] = await query;

    if (!result.length) {
      return successResponse('No providers found', []);
    }

    // Group the results using reduce for better performance
    const providersArray = result.reduce(
      (acc, row) => {
        const provider = acc[row.id] || {
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          website: row.website,
          logoUrl: row.logoUrl,
          status: row.status as BankFeedProviderStatus,
          countries: [],
        };

        if (row.countryId && row.countryCode) {
          provider.countries.push({
            id: row.countryId,
            code: row.countryCode,
          });
        }

        acc[row.id] = provider;
        return acc;
      },
      {} as Record<string, BankFeedProviderWithCountries>,
    );

    const providers = Object.values(providersArray);

    if (useCache) {
      await redis.set(cacheKey, JSON.stringify(providers), 'EX', TTL);
    }

    return successResponse('Providers fetched', providers);
  } catch (error: any) {
    return errorResponse('Failed to fetch providers', error.message);
  }
}

export async function updateBankFeedProvider({
  providerKey,
  data,
  userId,
  knex,
}: {
  providerKey: BankProviderKey;
  data: UpdateProviderInput;
  userId: string;
  knex?: Knex | Knex.Transaction;
}): Promise<ApiResponse<BankFeedProviderWithCountries>> {
  // Validate input
  const validate = updateProviderInput.safeParse(data);
  if (!validate.success) {
    return errorResponse('Invalid input', z.treeifyError(validate.error));
  }

  const validatedData = validate.data;

  const exec = async (trx: Knex.Transaction) => {
    // Get current provider
    const currentProvider = await trx('bank_feed_providers')
      .where('key', providerKey)
      .first();

    if (!currentProvider) {
      throw new Error(`Provider with key '${providerKey}' not found`);
    }

    // Update provider details if provided
    const providerUpdateData = {
      ...validatedData,
      updated_by_id: userId,
    };

    // Remove undefined values and country arrays (handled separately)
    const { new_countries, disable_countries, ...updateFields } =
      providerUpdateData;

    // Update provider if there are changes
    if (Object.keys(updateFields).length > 1) {
      // More than just updated_by_id
      await trx('bank_feed_providers')
        .where('id', currentProvider.id)
        .update(updateFields);
    }

    // Handle country updates
    if (validatedData.new_countries?.length) {
      for (const countryCode of validatedData.new_countries) {
        const country = await getCountryByCode(countryCode);
        if (!country?.data?.id) {
          throw new Error(`Country with code '${countryCode}' not found`);
        }

        // Insert or update country mapping
        await trx('bank_feed_provider_countries')
          .insert({
            bank_feed_provider_id: currentProvider.id,
            country_id: country.data.id,
            active: true,
            created_by_id: userId,
            updated_by_id: userId,
          })
          .onConflict(['bank_feed_provider_id', 'country_id'])
          .merge({
            active: true,
            updated_by_id: userId,
          });
      }
    }

    if (validatedData.disable_countries?.length) {
      for (const countryCode of validatedData.disable_countries) {
        const country = await getCountryByCode(countryCode);
        if (!country?.data?.id) {
          throw new Error(`Country with code '${countryCode}' not found`);
        }

        // Disable country mapping
        await trx('bank_feed_provider_countries')
          .where({
            bank_feed_provider_id: currentProvider.id,
            country_id: country.data.id,
          })
          .update({
            active: false,
            updated_by_id: userId,
          });
      }
    }

    // Return updated provider with countries
    const result = await getBankFeedProviders({
      providerKeys: [providerKey],
      useCache: false,
      trx,
    });

    if (!result.success || !result.data?.[0]) {
      throw new Error('Failed to fetch updated provider');
    }

    return result.data[0];
  };

  try {
    if (knex?.isTransaction) {
      const updatedProvider = await exec(knex as Knex.Transaction);
      await invalidateBankFeedProvidersCache();
      return successResponse('Provider updated successfully', updatedProvider);
    }

    return await knexClient.transaction(async (trx) => {
      const updatedProvider = await exec(trx);
      await invalidateBankFeedProvidersCache();
      return successResponse('Provider updated successfully', updatedProvider);
    });
  } catch (error: any) {
    return errorResponse('Failed to update provider', error.message);
  }
}
