import { knexClient } from '../../db/knexClient.js';
import { redis } from '../../lib/redis.js';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import { generateCacheKey } from '../../shared/utils/string.utils.js';
import {
  type CountryRow,
  type CountryRes,
  type GetCountriesOptions,
  toCountryRes,
} from './countries.types.js';

import type { ApiResponse } from '../../core/types/api.types.js';

type CountryIndex = {
  byId: Map<string, CountryRes>;
  byCode: Map<string, CountryRes>;
};

function buildCountryIndex(countries: CountryRes[]): CountryIndex {
  const byId = new Map<string, CountryRes>();
  const byCode = new Map<string, CountryRes>();
  for (const country of countries) {
    byId.set(country.id, country);
    byCode.set(country.code.toUpperCase(), country);
  }
  return { byId, byCode };
}

const countriesCacheKey = generateCacheKey('countries', 'all');
const CACHE_TTL = 60 * 60 * 24; // 24 hours

let countryIndex: CountryIndex | null = null;
let countryIndexBuiltAt: number | null = null;

async function ensureIndex(): Promise<CountryIndex> {
  const isStale =
    !countryIndexBuiltAt ||
    Date.now() - countryIndexBuiltAt >= CACHE_TTL * 1000;

  if (!countryIndex || isStale) await getCountries();
  if (!countryIndex) throw new Error('Failed to build country index');
  return countryIndex;
}

export async function getCountries({
  skipCache = false,
}: GetCountriesOptions = {}): Promise<ApiResponse<CountryRes[]>> {
  try {
    if (!skipCache) {
      const cachedCountries = await redis.get(countriesCacheKey);

      if (cachedCountries) {
        const parsed: CountryRes[] = JSON.parse(cachedCountries);
        countryIndex = buildCountryIndex(parsed);
        countryIndexBuiltAt = Date.now();
        return successResponse('Countries fetched from cache', parsed);
      }
    }
    const countries = (await knexClient('countries')
      .select('id', 'code', 'name', 'phone_code', 'flag', 'continent')
      .orderBy('name', 'asc')) as CountryRow[];

    const normalizedCountries: CountryRes[] = countries.map(toCountryRes);

    if (normalizedCountries.length === 0) {
      return errorResponse('No countries found', undefined, {
        code: ErrorCode.NOT_FOUND,
      });
    }

    await redis.set(
      countriesCacheKey,
      JSON.stringify(normalizedCountries),
      'EX',
      CACHE_TTL,
    );

    countryIndex = buildCountryIndex(normalizedCountries);
    countryIndexBuiltAt = Date.now();

    return successResponse(
      `${normalizedCountries.length} countries fetched successfully`,
      normalizedCountries,
    );
  } catch (error: unknown) {
    return errorResponse('Error fetching country list', error);
  }
}

export async function getCountryById(id: string) {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return errorResponse('Valid country id is required');
  }

  try {
    const index = await ensureIndex();
    const country = index.byId.get(id.trim()) ?? null;
    return successResponse(
      country ? 'Country fetched successfully' : 'Country not found',
      country,
    );
  } catch (error: unknown) {
    return errorResponse('Error fetching country', error);
  }
}

export async function getCountryByCode(code: string) {
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return errorResponse('Valid country code is required');
  }

  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return errorResponse('Country code must be 2 letters');
  }

  try {
    const index = await ensureIndex();
    const country = index.byCode.get(normalizedCode) ?? null;
    return successResponse(
      country ? 'Country fetched successfully' : 'Country not found',
      country,
    );
  } catch (error: unknown) {
    return errorResponse('Error fetching country', error);
  }
}
