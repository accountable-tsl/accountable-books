import { knexClient } from "../../db/knexClient.js";
import type { ApiResponse } from "../../core/types/api.types.js";
import { redis } from "../../lib/redis.js";
import { snakeToCamel } from "../../shared/utils/formatting.utils.js";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils.js";
import { generateCacheKey } from "../../shared/utils/string.utils.js";
import {
  type CountryRes,
  type GetCountriesOptions,
} from "./countries.types.js";

const countriesCacheKey = generateCacheKey("countries", "all");
const CACHE_TTL = 60 * 60 * 24; // 24 hours

export async function getCountries({
  skipCache = false,
}: GetCountriesOptions = {}): Promise<ApiResponse<CountryRes[]>> {
  try {
    if (!skipCache) {
      const cachedCountries = await redis.get(countriesCacheKey);

      if (cachedCountries) {
        return successResponse(
          "Countries fetched from cache",
          JSON.parse(cachedCountries),
        );
      }
    }
    const countries = await knexClient("countries")
      .select(
        "id",
        "code",
        "name",
        "phone_code as phoneCode",
        "flag",
        "continent",
      )
      .where("is_deleted", false)
      .orderBy("name", "asc");

    await redis.set(
      countriesCacheKey,
      JSON.stringify(countries),
      "EX",
      CACHE_TTL,
    );

    return successResponse(
      `${countries.length} countries fetched successfully`,
      countries,
    );
  } catch (error) {
    return errorResponse("Error fetching country list", error);
  }
}

export async function getCountryByCode(code: string) {
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return errorResponse("Valid country code is required");
  }

  const normalizedCode = code.trim().toUpperCase();
  // Validate code format (ISO 2-letter codes)
  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return errorResponse("Country code must be 2 letters");
  }

  try {
    // Get all countries (leverages cache from getCountries)
    const allCountriesRes = await getCountries();
    if (!allCountriesRes.success || !allCountriesRes.data) {
      return errorResponse("Failed to fetch countries");
    }

    const country = allCountriesRes.data.find(
      (c: CountryRes) => c.code.toUpperCase() === normalizedCode,
    );

    if (!country) {
      return successResponse("Country not found", null);
    }

    return successResponse("Country fetched successfully", country);
  } catch (error) {
    return errorResponse("Error fetching country", error);
  }
}
