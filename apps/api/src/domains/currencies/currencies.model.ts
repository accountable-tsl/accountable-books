import { knexClient } from '../../db/knexClient.js';
import type { ApiResponse } from '../../core/types/api.types.js';
import { redis } from '../../lib/redis.js';
import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { generateCacheKey } from '../../shared/utils/string.utils.js';
import { type CurrencyRes } from './currencies.types.js';

const currenciesCacheKey = generateCacheKey('currencies', 'all');
const CACHE_TTL = 60 * 60 * 24; // 24 hours
export async function getAllCurrencies({
  skipCache = false,
}: { skipCache?: boolean } = {}): Promise<ApiResponse<CurrencyRes[]>> {
  try {
    if (!skipCache) {
      const cachedCurrencies = await redis.get(currenciesCacheKey);
      if (cachedCurrencies) {
        return successResponse(
          'Currencies fetched from cache',
          JSON.parse(cachedCurrencies),
        );
      }
    }

    const currencies = await knexClient('currencies')
      .select('id', 'code', 'name', 'symbol')
      .where('is_deleted', false);

    if (currencies.length === 0) successResponse('No currencies found', []);

    await redis.set(
      currenciesCacheKey,
      JSON.stringify(currencies),
      'EX',
      CACHE_TTL,
    );

    return successResponse(
      `Successfully retrieved ${currencies.length} currencies`,
      currencies,
    );
  } catch (error) {
    return errorResponse('Failed to fetch currencies', error);
  }
}

export async function getCurrencyByCode(
  code: string,
): Promise<ApiResponse<CurrencyRes | null>> {
  try {
    // Input validation
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return errorResponse('Valid currency code is required');
    }

    const normalizedCode = code.trim().toUpperCase();

    // Validate code format (3-letter ISO currency codes)
    if (!/^[A-Z]{3}$/.test(normalizedCode)) {
      return errorResponse('Currency code must be 3 letters');
    }

    // Get all currencies (leverages cache from getAllCurrencies)
    const allCurrenciesRes = await getAllCurrencies();

    if (!allCurrenciesRes.success || !allCurrenciesRes.data) {
      return errorResponse('Failed to fetch currencies');
    }

    const currency = allCurrenciesRes.data.find(
      (c: CurrencyRes) => c.code.toUpperCase() === normalizedCode,
    );

    if (!currency) {
      return successResponse('Currency not found', null);
    }

    return successResponse('Currency fetched successfully', currency);
  } catch (error) {
    console.error('Error fetching currency by code:', error);
    return errorResponse('Failed to fetch currency');
  }
}
