import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import { isValidUUID } from '../../shared/utils/formatting.utils.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { generateCacheKey } from '../../shared/utils/string.utils.js';
import { toCurrencyRes } from './currencies.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';
import type { CurrencyRes, CurrencyRow } from './currencies.types.js';

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
          JSON.parse(cachedCurrencies) as CurrencyRes[],
        );
      }
    }

    const currencies = (await knexClient('currencies').select(
      'id',
      'code',
      'name',
      'symbol',
      'minor_unit',
    )) as CurrencyRow[];

    const normalizedCurrencies: CurrencyRes[] = currencies.map(toCurrencyRes);

    if (normalizedCurrencies.length === 0) {
      return errorResponse('No currencies found', undefined, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    await redis.set(
      currenciesCacheKey,
      JSON.stringify(normalizedCurrencies),
      'EX',
      CACHE_TTL,
    );

    return successResponse(
      `Successfully retrieved ${normalizedCurrencies.length} currencies`,
      normalizedCurrencies,
    );
  } catch (error) {
    return errorResponse('Failed to fetch currencies', error);
  }
}

export async function getCurrencyByCodeModel(
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
      return errorResponse(allCurrenciesRes.message, allCurrenciesRes.error, {
        code: allCurrenciesRes.code as ErrorCode | undefined,
      });
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

export async function getCurrencyByIdModel(
  id: string,
): Promise<ApiResponse<CurrencyRes | null>> {
  try {
    // Input validation
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return errorResponse('Valid currency ID is required');
    }

    const normalizedId = id.trim();

    if (!isValidUUID(normalizedId)) {
      return errorResponse('Invalid currency ID format');
    }

    // Get all currencies (leverages cache from getAllCurrencies)
    const allCurrenciesRes = await getAllCurrencies();

    if (!allCurrenciesRes.success || !allCurrenciesRes.data) {
      return errorResponse(allCurrenciesRes.message, allCurrenciesRes.error, {
        code: allCurrenciesRes.code as ErrorCode | undefined,
      });
    }

    const currency = allCurrenciesRes.data.find(
      (c: CurrencyRes) => c.id === normalizedId,
    );

    if (!currency) {
      return successResponse('Currency not found', null);
    }

    return successResponse('Currency fetched successfully', currency);
  } catch (error) {
    console.error('Error fetching currency by ID:', error);
    return errorResponse('Failed to fetch currency');
  }
}
