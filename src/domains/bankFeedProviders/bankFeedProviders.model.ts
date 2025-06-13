import type { Knex } from "knex";
import knexClient from "../../../knexClient";
import { ApiResponse } from "../../core/types/api.types";
import {
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import {
  bankFeedProviderInputCamel,
  BankFeedProviderInputCamel,
  BankFeedProviderStatus,
  BankFeedProviderWithCountries,
  BpcInput,
  bpcInputCamel,
  BpcInputCamel,
  NewBankFeedProviderCountry,
} from "./bankFeedProviders.types";
import { redis } from "../../lib/redis";

export async function invalidateBankFeedProvidersCache(providerIds?: string[]) {
  try {
    const pattern = "bank_feed_providers:*";
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn("Cache invalidation failed:", error);
  }
}

export async function addBankFeedProvider({
  userId,
  input,
  knex = knexClient,
}: {
  userId: string;
  input: BankFeedProviderInputCamel[];
  knex?: Knex;
}): Promise<ApiResponse<BankFeedProviderInputCamel[]>> {
  // Validate input
  const safeInput = bankFeedProviderInputCamel.array().safeParse(input);
  if (!safeInput.success) {
    return errorResponse("Invalid input", safeInput.error.flatten());
  }

  // Add created_by_id and updated_by_id
  const updatedInput = safeInput.data.map((provider) => ({
    ...provider,
    created_by_id: userId,
    updated_by_id: userId,
  }));

  try {
    const providers = await knex("bank_feed_providers")
      .insert(updatedInput)
      .returning("*");

    if (!providers.length) return errorResponse("Failed to create provider(s)");
    await invalidateBankFeedProvidersCache();
    return successResponse("Provider(s) successfully created", providers);
  } catch (error: any) {
    if (error.code === "23505") {
      return errorResponse("Provider key must be unique", error.detail);
    }
    return errorResponse("Unknown error occurred", error);
  }
}

export async function addBankFeedProviderCountries({
  input,
  userId,
  knex = knexClient,
}: {
  input: BpcInputCamel[];
  userId: string;
  knex?: Knex;
}): Promise<ApiResponse<[]>> {
  // Validate input
  const safeInput = bpcInputCamel.array().safeParse(input);
  if (!safeInput.success) {
    return errorResponse("Invalid input", safeInput.error.flatten());
  }

  const data = safeInput.data;
  const errors: { index: number; message: string }[] = [];
  const toInsert: NewBankFeedProviderCountry[] = [];

  // Collect unique IDs/codes for all lookups
  const countryCodes = Array.from(
    new Set(data.map((x) => x.country_code).filter(Boolean))
  ) as string[];
  const countryIds = Array.from(
    new Set(data.map((x) => x.country_id).filter(Boolean))
  ) as string[];
  const providerIds = Array.from(
    new Set(data.map((x) => x.bank_feed_provider_id).filter(Boolean))
  ) as string[];
  const providerKeys = Array.from(
    new Set(data.map((x) => x.bank_feed_provider_key).filter(Boolean))
  ) as string[];

  // Batch query all countries and providers needed
  const countries: { id: string; code: string }[] = await knex("countries")
    .modify((qb) => {
      if (countryCodes.length) qb.orWhereIn("code", countryCodes);
      if (countryIds.length) qb.orWhereIn("id", countryIds);
    })
    .select("id", "code");

  const providers: { id: string; key: string }[] = await knex(
    "bank_feed_providers"
  )
    .modify((qb) => {
      if (providerIds.length) qb.orWhereIn("id", providerIds);
      if (providerKeys.length) qb.orWhereIn("key", providerKeys);
    })
    .select("id", "key");

  // Prepare map lookups
  const countryById = Object.fromEntries(countries.map((c) => [c.id, c]));
  const countryByCode = Object.fromEntries(countries.map((c) => [c.code, c]));

  const providerById = Object.fromEntries(providers.map((p) => [p.id, p]));
  const providerByKey = Object.fromEntries(providers.map((p) => [p.key, p]));

  // Build insert data and collect errors
  data.forEach((row, i) => {
    let resolvedProvider: { id: string; key: string } | undefined;
    if (row.bank_feed_provider_id && row.bank_feed_provider_key) {
      const keyMatch = providerById[row.bank_feed_provider_id];
      const idMatch = providerByKey[row.bank_feed_provider_key];
      if (!keyMatch || !idMatch || keyMatch.id !== idMatch.id) {
        errors.push({
          index: i,
          message: `bankFeedProviderId (${row.bank_feed_provider_id}) and bankFeedProviderKey (${row.bank_feed_provider_key}) do not match the same provider`,
        });
        return;
      }
      resolvedProvider = idMatch;
    } else if (row.bank_feed_provider_id) {
      resolvedProvider = providerById[row.bank_feed_provider_id];
      if (!resolvedProvider) {
        errors.push({
          index: i,
          message: `bankFeedProviderId (${row.bank_feed_provider_id}) does not exist`,
        });
        return;
      }
    } else if (row.bank_feed_provider_key) {
      resolvedProvider = providerByKey[row.bank_feed_provider_key];
      if (!resolvedProvider) {
        errors.push({
          index: i,
          message: `bankFeedProviderKey (${row.bank_feed_provider_key}) does not exist`,
        });
        return;
      }
    } else {
      errors.push({
        index: i,
        message:
          "At least one of bankFeedProviderId or bankFeedProviderKey must be provided",
      });
      return;
    }

    let country: { id: string; code: string } | undefined;
    if (row.country_code && row.country_id) {
      const codeMatch = countryByCode[row.country_code];
      const idMatch = countryById[row.country_id];
      if (!codeMatch || !idMatch || codeMatch.id !== idMatch.id) {
        errors.push({
          index: i,
          message: `countryCode (${row.country_code}) and countryId (${row.country_id}) do not match the same country`,
        });
        return;
      }
      country = idMatch;
    } else if (row.country_code) {
      country = countryByCode[row.country_code];
      if (!country) {
        errors.push({
          index: i,
          message: `countryCode (${row.country_code}) does not exist`,
        });
        return;
      }
    } else if (row.country_id) {
      country = countryById[row.country_id];
      if (!country) {
        errors.push({
          index: i,
          message: `countryId (${row.country_id}) does not exist`,
        });
        return;
      }
    } else {
      errors.push({
        index: i,
        message: "At least one of countryCode or countryId must be provided.",
      });
      return;
    }

    toInsert.push({
      bank_feed_provider_id: resolvedProvider.id,
      country_id: country.id,
      created_by_id: userId,
      updated_by_id: userId,
    });
  });

  // Return all errors at once if any
  if (errors.length) {
    return errorResponse("One or more errors in your input.", errors);
  }

  try {
    const rows = await knex("bank_feed_provider_countries")
      .insert(toInsert)
      .returning("*");
    if (!rows.length) {
      return errorResponse("Failed to create country mapping(s)");
    }
    await invalidateBankFeedProvidersCache();
    return successResponse("Mapping(s) successfully created", rows);
  } catch (error: any) {
    if (error.code === "23505") {
      return errorResponse(
        "Provider-country mapping must be unique",
        error.detail
      );
    }
    return errorResponse("Unknown error occurred", error);
  }
}

export function buildProviderCountryMappings(
  providerKey: string,
  countryCodes: string[],
  userId?: string
): BpcInputCamel[] {
  return countryCodes.map((countryCode) => ({
    bank_feed_provider_key: providerKey,
    country_code: countryCode,
    ...(userId && { updatedById: userId, createdById: userId }),
  }));
}

export async function getBankFeedProviders({
  providerIds,
  providerKeys,
  useCache = true,
}: {
  providerIds?: string | string[];
  providerKeys?: string | string[];
  useCache?: boolean;
}): Promise<ApiResponse<BankFeedProviderWithCountries[]>> {
  try {
    // Normalize inputs to arrays
    const idsArray = providerIds
      ? Array.isArray(providerIds)
        ? providerIds
        : [providerIds]
      : [];
    const keysArray = providerKeys
      ? Array.isArray(providerKeys)
        ? providerKeys
        : [providerKeys]
      : [];

    // Generate cache key
    const cacheKey = `bank_feed_providers:${JSON.stringify({
      ids: idsArray.sort(),
      keys: keysArray.sort(),
    })}`;

    // Try to get from cache first
    if (useCache) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          return successResponse("Providers fetched (cached)", data);
        }
      } catch (cacheError) {
        console.error({ cacheError });
      }
    }

    const results = (await knexClient("bank_feed_providers as p")
      .where("p.is_deleted", false)
      .whereNot("p.status", "deprecated")
      .leftJoin(
        "bank_feed_provider_countries as bpc",
        "p.id",
        "bpc.bank_feed_provider_id"
      )
      .leftJoin("countries as c", "bpc.country_id", "c.id")
      .modify((qb) => {
        if (idsArray.length && keysArray.length) {
          qb.where(function () {
            this.whereIn("p.id", idsArray).orWhereIn("p.key", keysArray);
          });
        } else if (idsArray.length) {
          qb.whereIn("p.id", idsArray);
        } else if (keysArray.length) {
          qb.whereIn("p.key", keysArray);
        }
        // If no filters, return all providers
      })
      .select(
        "p.id",
        "p.key",
        "p.name",
        "p.description",
        "p.website",
        "p.logo_url as logoUrl",
        "p.logo_key as logoKey",
        "p.status",
        "p.priority",
        "p.external_id as externalId",
        "c.id as countryId",
        "c.code as countryCode"
      )) as Array<
      Omit<BankFeedProviderWithCountries, "countries"> & {
        countryId: string | null;
        countryCode: string | null;
      }
    >;

    if (!results.length) {
      return successResponse("No providers found", []);
    }

    // Group the results
    const providerMap: Record<string, BankFeedProviderWithCountries> = {};

    results.forEach((row) => {
      if (!providerMap[row.id]) {
        providerMap[row.id] = {
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          website: row.website,
          logoUrl: row.logoUrl,
          logoKey: row.logoKey,
          status: row.status,
          priority: row.priority,
          externalId: row.externalId,
          countries: [],
        };
      }

      if (row.countryId && row.countryCode) {
        providerMap[row.id].countries.push({
          id: row.countryId,
          code: row.countryCode,
        });
      }
    });

    const result = Object.values(providerMap);
    if (useCache) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 60 * 15);
    }

    return successResponse("Providers fetched", result);
  } catch (error: any) {
    return errorResponse("Failed to fetch providers", error.message);
  }
}
