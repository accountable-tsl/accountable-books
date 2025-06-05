import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import { redis } from "../../lib/redis";
import { camelToSnake, isValidUUID } from "../../shared/utils/formatting.utils";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import { generateCacheKey } from "../../shared/utils/string.utils";
import {
  fetchBanksOptions,
  FetchBanksOptions,
  FetchBanksResponse,
  newBank,
  NewInput,
} from "./banks.types";

export async function addNewBank(
  data: NewInput | NewInput[],
  knexInstance = knexClient
) {
  // Normalize input to an array
  const bankData = Array.isArray(data) ? data : [data];
  const banks = camelToSnake(bankData);

  // Validate all entries
  const validatedData = newBank.array().safeParse(banks);

  if (!validatedData.success) {
    return errorResponse(
      `Invalid input provided: ${validatedData.error.message}`,
      validatedData.error.flatten()
    );
  }
  try {
    const inserted = await knexInstance("banks")
      .insert(validatedData.data)
      .returning("id");

    if (!inserted || inserted.length === 0) {
      return errorResponse("No banks were inserted");
    }
    return successResponse(
      `${inserted.length} bank(s) added successfully`,
      inserted
    );
  } catch (error) {
    return errorResponse("Failed to add new bank", error);
  }
}

const bankResponse = [
  "banks.id",
  "banks.key",
  "banks.display_name as displayName",
  "banks.official_name as officialName",
  "banks.swift_code as swiftCode",
  "banks.local_code as localCode",
  "banks.local_code_type as localCodeType",
  "banks.website",
  "banks.logo_url as logoUrl",
  "banks.logo_key as logoKey",
  "countries.id as countryId",
  "countries.code as countryCode",
  "countries.name as countryName",
  "countries.flag as countryFlag",
];

function getCacheKeyFromOptions(opts: FetchBanksOptions): string | null {
  if (opts.id) return generateCacheKey("bank", "id", opts.id);
  if (opts.key) return generateCacheKey("bank", "key", opts.key);
  if (opts.countryId)
    return generateCacheKey("banks", "country", opts.countryId);
  if (opts.countryCode)
    return generateCacheKey("banks", "country", opts.countryCode);
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
  options: FetchBanksOptions = {}
): Promise<ApiResponse<FetchBanksResponse[]>> {
  const validation = fetchBanksOptions.safeParse(options);
  if (!validation.success) {
    return errorResponse("Invalid input provided", validation.error.flatten());
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
              ? "Successfully retrieved bank"
              : countryCode || countryId
                ? "Successfully retrieved banks for country"
                : "Successfully retrieved banks";

          return successResponse(message, parsedData);
        }
      } catch (cacheError) {
        console.warn("Cache read failed:", cacheError);
      }
    }

    const query = knexClient("banks")
      .select<FetchBanksResponse[]>(bankResponse)
      .leftJoin("countries", "banks.country_id", "countries.id")
      .where("banks.is_deleted", false);

    if (id) {
      query.andWhere("banks.id", id);
    } else if (key) {
      query.andWhere("banks.key", key);
    }

    if (countryId) {
      query.andWhere("banks.country_id", countryId);
    } else if (countryCode) {
      query.andWhere("countries.code", countryCode);
    }

    const results = await query;

    if ((id || key) && !results.length) {
      return errorResponse("Bank not found");
    }

    if (cacheKey && results.length > 0) {
      try {
        const ttl =
          id || key
            ? 60 * 60 * 24 // 24 hours for single bank
            : 60 * 60 * 4; // 4 hours for country lists
        await redis.set(cacheKey, JSON.stringify(results), "EX", ttl);
      } catch (cacheError) {
        console.warn("Cache write failed:", cacheError);
      }
    }

    const message =
      id || key
        ? "Successfully retrieved bank"
        : countryId
          ? `Successfully retrieved ${results.length} banks for country`
          : `Successfully retrieved ${results.length} banks`;

    return successResponse(message, results);
  } catch (error) {
    return errorResponse("An unexpected error occurred");
  }
}

export async function getAllBanks() {
  return await fetchBanks();
}

export async function getSingleBank(
  keyOrId: string
): Promise<ApiResponse<FetchBanksResponse>> {
  if (!keyOrId || keyOrId.length > 40) {
    return errorResponse("Bank key or id is required");
  }

  const isUUID = isValidUUID(keyOrId);
  const res = await fetchBanks(isUUID ? { id: keyOrId } : { key: keyOrId });

  if (!res.success || !res.data || res.data.length === 0) {
    return errorResponse("Bank not found", res);
  }
  return successResponse("Successfully retrieved bank", res.data[0]);
}
