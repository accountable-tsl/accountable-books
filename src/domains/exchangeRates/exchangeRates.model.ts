import Decimal from "decimal.js";
import type { Knex } from "knex";
import { ApiResponse } from "../../core/types/api.types";
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from "../../shared/utils/response.utils";
import axios from "axios";
import { knexClient } from "../../../knexClient";
import {
  ExchangeRateData,
  ExchangeRateItem,
  newExchangeRate,
  NewExchangeRateInput,
} from "./exchangeRate.types";

export async function createNewExRates(
  data: ExchangeRateItem[],
  chunkSize: number = 100,
  knex: Knex = knexClient
) {
  const validatedData = newExchangeRate.array().safeParse(data);

  if (!validatedData.success) {
    return errorResponse(
      "Invalid input provided",
      validatedData.error.flatten()
    );
  }

  try {
    const result = await knex.transaction(async (trx) => {
      let totalInserted = 0;

      for (let i = 0; i < data.length; i += chunkSize) {
        const insertResult = await trx("exchange_rates")
          .insert(data.slice(i, i + chunkSize))
          .onConflict(["date", "from_currency_id", "to_currency_id"])
          .ignore();

        totalInserted += insertResult.length || 0;
      }

      return totalInserted;
    });

    return successResponse(
      `${data.length} exchange rates processed. ${result} inserted, duplicates skipped.`,
      result
    );
  } catch (error) {
    return errorResponse("Failed to create exchange rates");
  }
}

/**
 * Fetches exchange rate between two currencies for a given date.
 * First checks database for existing rates within a lookback window,
 * then falls back to external API if not found.
 *
 * @param date - Target date for exchange rate
 * @param fromCurrencyId - Source currency ID
 * @param toCurrencyId - Target currency ID
 * @param knex - Knex database instance or transaction
 * @returns Promise resolving to exchange rate result
 */
export async function fetchExchangeRate(
  date: Date,
  fromCurrencyId: string,
  toCurrencyId: string,
  knex: Knex = knexClient
): Promise<ApiResponse<ExchangeRateItem>> {
  // TODO: Cache in Redis to reduce API calls
  try {
    // 1. Early exit for identical currencies
    if (fromCurrencyId === toCurrencyId) {
      return successResponse("Base and target currencies are identical", {
        id: "SYNTHETIC",
        date: new Date(date),
        fromCurrencyId,
        toCurrencyId,
        rate: new Decimal(1),
      });
    }

    // 2. Validate currencies first to fail fast
    const [fromCurrency, toCurrency] = await Promise.all([
      knex("currencies")
        .where({ id: fromCurrencyId })
        .select({ code: true })
        .first() as Promise<{ code: string } | undefined>,

      knex("currencies")
        .where({ id: toCurrencyId })
        .select({ code: true })
        .first() as Promise<{ code: string } | undefined>,
    ]);

    if (!fromCurrency?.code || !toCurrency?.code) {
      return errorResponse("Invalid currency IDs", {
        missingFrom: !fromCurrency?.code,
        missingTo: !toCurrency?.code,
      });
    }

    // Normalize date to UTC midnight for consistent lookups
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setUTCHours(0, 0, 0, 0);
      return normalized;
    };

    const rateLookbackDays = 5;
    const searchDate = normalizeDate(date);

    // Create search window: lookback days before to 1 day after target date
    const lookbackStart = new Date(searchDate);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - rateLookbackDays);

    const searchWindowEnd = new Date(searchDate);
    searchWindowEnd.setUTCDate(searchWindowEnd.getUTCDate() + 1);

    // Check for existing rate within the search window

    const dbRate = await knex("exchange_rates")
      .select("id", "date", "rate", "from_currency_id", "to_currency_id")
      .where({
        from_currency_id: fromCurrencyId,
        to_currency_id: toCurrencyId,
      })
      .whereBetween("date", [lookbackStart, searchWindowEnd])
      .orderBy("date", "desc")
      .first();

    if (dbRate) {
      const isSameDay =
        dbRate.date.toISOString().slice(0, 10) ===
        searchDate.toISOString().slice(0, 10);

      return successResponse(
        isSameDay ? "Exact rate found" : "Closest available rate found",
        {
          id: dbRate.id,
          date: dbRate.date,
          rate: new Decimal(dbRate.rate),
          fromCurrencyId: dbRate.from_currency_id,
          toCurrencyId: dbRate.to_currency_id,
        }
      );
    }

    // If no rate found, fetch from external API
    let apiResponse;
    const apiUrl = `https://open.er-api.com/v6/latest/${fromCurrency.code}`;
    const apiRetryAttempts = 3;
    const requestTimeout = 5000;

    for (let attempt = 0; attempt <= apiRetryAttempts; attempt++) {
      try {
        apiResponse = await axios.get(apiUrl, { timeout: requestTimeout });
        if (apiResponse.status === 200) break;
      } catch (error) {
        if (attempt === apiRetryAttempts) {
          return errorResponse(
            axios.isAxiosError(error)
              ? `API request failed after ${apiRetryAttempts + 1} attempts: ${error.code || error.message}`
              : "Unknown API error after multiple attempts",
            axios.isAxiosError(error) ? error.toJSON() : error,
            ErrorCode.SERVICE_UNAVAILABLE,
            true
          );
        }

        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }

    const apiData = apiResponse?.data;

    if (!apiData?.rates || !apiData.time_last_update_unix) {
      return errorResponse(
        "Invalid or incomplete Exchange Rates API response received",
        apiData,
        ErrorCode.SERVICE_UNAVAILABLE,
        true
      );
    }

    const apiRate = apiData.rates[toCurrency.code];
    if (!apiRate) {
      return errorResponse(
        `Exchange rate for ${fromCurrency.code} → ${toCurrency.code} not available from API`,
        { from: fromCurrency.code, to: toCurrency.code },
        ErrorCode.NOT_FOUND,
        true // report
      );
    }

    const ratePrecision = 9;
    const processedRate = new Decimal(apiRate).toDecimalPlaces(ratePrecision);
    const rateDate = new Date(apiData.time_last_update_unix * 1000);
    rateDate.setUTCHours(0, 0, 0, 0);

    // Persist the rate to database with conflict handling
    try {
      // Use INSERT ... ON CONFLICT for PostgreSQL or similar upsert pattern
      const rateData = {
        date: rateDate,
        from_currency_id: fromCurrencyId,
        to_currency_id: toCurrencyId,
        rate: processedRate.toString(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Try to insert, handle conflicts gracefully
      let persistedRate;

      try {
        const [insertedId] = await knex("exchange_rates")
          .insert(rateData)
          .returning("id");

        persistedRate = await knex("exchange_rates")
          .select("id", "date", "rate", "from_currency_id", "to_currency_id")
          .where("id", insertedId)
          .first();
      } catch (insertError: any) {
        // Handle duplicate key constraint violations
        const isDuplicateError =
          insertError.code === "23505" || // PostgreSQL unique violation
          insertError.code === "SQLITE_CONSTRAINT" || // SQLite constraint
          insertError.errno === 1062 || // MySQL duplicate entry
          insertError.message?.toLowerCase().includes("duplicate") ||
          insertError.message?.toLowerCase().includes("unique");

        if (isDuplicateError) {
          console.warn(
            `Exchange rate for ${fromCurrencyId} → ${toCurrencyId} on ${rateDate.toISOString()} already exists`
          );

          // Fetch the existing rate
          persistedRate = await knex("exchange_rates")
            .select("id", "date", "rate", "from_currency_id", "to_currency_id")
            .where({
              from_currency_id: fromCurrencyId,
              to_currency_id: toCurrencyId,
              date: rateDate,
            })
            .first();

          if (persistedRate) {
            return successResponse("Rate already existed in database", {
              id: persistedRate.id,
              date: persistedRate.date,
              fromCurrencyId,
              toCurrencyId,
              rate: new Decimal(persistedRate.rate),
            });
          }
        }

        throw insertError; // Re-throw if not a duplicate error
      }

      if (!persistedRate) {
        throw new Error("Failed to retrieve persisted rate");
      }

      return successResponse("API rate successfully persisted to database", {
        id: persistedRate.id,
        date: persistedRate.date,
        fromCurrencyId: persistedRate.from_currency_id,
        toCurrencyId: persistedRate.to_currency_id,
        rate: new Decimal(persistedRate.rate),
      });
    } catch (dbError: any) {
      return errorResponse("Failed to persist exchange rate to database", {
        type: "database_error",
        details: dbError.message || "Unknown database error",
        code: dbError.code,
      });
    }
  } catch (error: any) {
    return errorResponse(
      "An unexpected error occurred while fetching exchange rate",
      error
    );
  }
}
