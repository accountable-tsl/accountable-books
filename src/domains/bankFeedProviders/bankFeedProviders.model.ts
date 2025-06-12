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
  BpcInput,
  bpcInputCamel,
  BpcInputCamel,
  NewBankFeedProviderCountry,
} from "./bankFeedProviders.types";

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
