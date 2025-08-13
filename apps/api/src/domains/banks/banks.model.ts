import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { redis } from '../../lib/redis.js';
import { camelToSnake, isValidUUID } from '../../shared/utils/formatting.utils.js';
import { errorResponse, successResponse } from '../../shared/utils/response.utils.js';
import { generateCacheKey } from '../../shared/utils/string.utils.js';
import {
  fetchBanksOptions,
  type FetchBanksOptions,
  type FetchBanksResponse,
  newBank,
  newBankInput,
  type NewInput,
} from './banks.types.js';

export async function addNewBank(data: NewInput | NewInput[], userId: string, knex = knexClient) {
  // Normalize input to an array
  const bankData = Array.isArray(data) ? data : [data];
  const banks = camelToSnake(bankData);

  // Validate all entries
  const validatedData = newBankInput.array().safeParse(banks);

  if (!validatedData.success) {
    return errorResponse(
      `Invalid input provided: ${validatedData.error.message}`,
      validatedData.error.flatten(),
    );
  }

  // Extract unique countries for batch lookup
  const uniqueCountries = [...new Set(validatedData.data.map((bank) => bank.country))];

  // Batch fetch countries by code and ID
  const [countriesByCode, countriesById] = await Promise.all([
    knex('countries')
      .whereIn(
        'code',
        uniqueCountries.filter((c) => c.length === 2),
      )
      .select('id', 'code'),
    knex('countries')
      .whereIn(
        'id',
        uniqueCountries.filter((c) => c.length !== 2),
      )
      .select('id'),
  ]);

  // Create lookup maps
  const countryCodeMap = new Map(countriesByCode.map((c) => [c.code, c.id]));
  const countryIdMap = new Map(countriesById.map((c) => [c.id, c.id]));

  // Process banks and collect errors
  const bankCountryErrors: string[] = [];
  const processedBanks = validatedData.data
    .map((bank, index) => {
      const countryId =
        bank.country.length === 2
          ? countryCodeMap.get(bank.country)
          : countryIdMap.get(bank.country);

      if (!countryId) {
        bankCountryErrors.push(`Bank #${index + 1}: Country ${bank.country} not found`);
        return null;
      }

      return {
        ...bank,
        country_id: countryId,
        created_by_id: userId,
        updated_by_id: userId,
      };
    })
    .filter(Boolean); // Remove nulls

  // Return early if there are country validation errors
  if (bankCountryErrors.length > 0) {
    return errorResponse('Country validation failed', {
      errors: bankCountryErrors,
    });
  }

  const validateProcessedBanks = newBank.array().safeParse(processedBanks);
  if (!validateProcessedBanks.success) {
    return errorResponse(
      `Invalid input provided: ${validateProcessedBanks.error.message}`,
      validateProcessedBanks.error.flatten(),
    );
  }

  console.log(`Inserting ${validateProcessedBanks.data.length} banks...`);

  try {
    const inserted = await knex('banks').insert(validateProcessedBanks.data).returning('id');

    if (!inserted || inserted.length === 0) {
      return errorResponse('No banks were inserted');
    }
    return successResponse(`${inserted.length} bank(s) added successfully`, inserted);
  } catch (error) {
    return errorResponse('Failed to add new bank', error);
  }
}

const bankResponse = [
  'banks.id',
  'banks.key',
  'banks.display_name as displayName',
  'banks.official_name as officialName',
  'banks.swift_code as swiftCode',
  'banks.local_code as localCode',
  'banks.local_code_type as localCodeType',
  'banks.website',
  'banks.logo_url as logoUrl',
  'banks.logo_key as logoKey',
  'countries.id as countryId',
  'countries.code as countryCode',
  'countries.name as countryName',
  'countries.flag as countryFlag',
];

function getCacheKeyFromOptions(opts: FetchBanksOptions): string | null {
  if (opts.id) return generateCacheKey('banks', 'id', opts.id);
  if (opts.key) return generateCacheKey('banks', 'key', opts.key);
  if (opts.countryId) return generateCacheKey('banks', 'country', opts.countryId);
  if (opts.countryCode) return generateCacheKey('banks', 'country', opts.countryCode);
  return null;
}

/**
 * Fetches banks from the database with caching.
 * @param options - Optional filters (id or key).
 * @returns A promise resolving to an ApiResponse with bank data.
 * @example
 * fetchBanks({ id: 123 }) // Returns single bank
 * fetchBanks() // Returns all banks
 */
export async function fetchBanks(
  options: FetchBanksOptions = {},
): Promise<ApiResponse<FetchBanksResponse[]>> {
  const validation = fetchBanksOptions.safeParse(options);
  if (!validation.success) {
    return errorResponse('Invalid input provided', validation.error.flatten());
  }

  const { id, key, countryId, countryCode } = validation.data;

  // Cache individual banks and country-specific queries
  const cacheKey = getCacheKeyFromOptions(validation.data);

  try {
    if (cacheKey) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsedData = JSON.parse(cached);
          const message =
            id || key
              ? 'Successfully retrieved bank'
              : countryCode || countryId
                ? 'Successfully retrieved banks for country'
                : 'Successfully retrieved banks';

          return successResponse(message, parsedData);
        }
      } catch (cacheError) {
        console.warn('Cache read failed:', cacheError);
      }
    }

    const query = knexClient('banks')
      .select<FetchBanksResponse[]>(bankResponse)
      .leftJoin('countries', 'banks.country_id', 'countries.id')
      .where('banks.is_deleted', false);

    if (id) {
      query.andWhere('banks.id', id);
    } else if (key) {
      query.andWhere('banks.key', key);
    }

    if (countryId) {
      query.andWhere('banks.country_id', countryId);
    } else if (countryCode) {
      query.andWhere('countries.code', countryCode);
    }

    const results = await query;

    if ((id || key) && !results.length) {
      return errorResponse('Bank not found');
    }

    if ((countryCode || countryId) && !results.length) {
      return errorResponse('No banks found for the specified country');
    }

    if (cacheKey && results.length > 0) {
      try {
        const ttl =
          id || key
            ? 60 * 60 * 24 // 24 hours for single bank
            : 60 * 60 * 4; // 4 hours for country lists
        await redis.set(cacheKey, JSON.stringify(results), 'EX', ttl);
      } catch (cacheError) {
        console.warn('Cache write failed:', cacheError);
      }
    }

    const message =
      id || key
        ? 'Successfully retrieved bank'
        : countryId
          ? `Successfully retrieved ${results.length} banks for country`
          : `Successfully retrieved ${results.length} banks`;

    return successResponse(message, results);
  } catch (error) {
    return errorResponse('An unexpected error occurred');
  }
}

export async function getAllBanks() {
  return await fetchBanks();
}

export async function getSingleBank(keyOrId: string): Promise<ApiResponse<FetchBanksResponse>> {
  if (!keyOrId || keyOrId.length > 40) {
    return errorResponse('Bank key or id is required');
  }

  const isUUID = isValidUUID(keyOrId);
  const res = await fetchBanks(isUUID ? { id: keyOrId } : { key: keyOrId });

  if (!res.success || !res.data || res.data.length === 0) {
    return errorResponse('Bank not found', res);
  }
  return successResponse('Successfully retrieved bank', res.data[0]);
}

export async function getBankByCountry(
  country: string,
): Promise<ApiResponse<FetchBanksResponse[]>> {
  if (!country) {
    return errorResponse('Country code or ID is required');
  }

  const isUUID = isValidUUID(country);
  const options = isUUID ? { countryId: country } : { countryCode: country.toUpperCase() };

  const countryCode = country.length === 2 ? country : null;
  const countryId = isValidUUID(country) ? country : null;

  if (!isUUID && country.length !== 2) {
    return errorResponse('Country code must be 2 characters');
  }

  if (!countryId && !countryCode) {
    return errorResponse('Country code or id is required');
  }

  return await fetchBanks(options);
}
