console.log("🚨 exRateModel.ts is being imported");
console.trace("🚨 exRateModel.ts loaded");
console.log("Loaded from:", new Error().stack);

import { Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import axios from "axios";
const prisma = new PrismaClient();

export interface ExRateItem {
  date: Date;
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: Decimal;
}
export async function createNewExRates(
  data: ExRateItem[],
  tx: PrismaClient | Prisma.TransactionClient = prisma
) {
  try {
    const result = await tx.exchangeRate.createMany({
      data: data.map((item) => ({
        ...item,
        rate: new Decimal(item.rate),
        date: new Date(item.date),
      })),
      skipDuplicates: true,
    });

    return result
      ? {
          success: true,
          message: `${data.length} rows processed. Duplicates skipped.`,
        }
      : {
          success: false,
          message: "Failed to create exchange rates",
        };
  } catch (error) {
    console.error("Error in createNewExRates:", error);
    return { success: false, message: "Failed to create exchange rates" };
  }
}

export async function fetchExchangeRate(
  date: Date,
  fromCurrencyId: string,
  toCurrencyId: string,
  tx: PrismaClient | Prisma.TransactionClient = prisma
) {
  try {
    // 1. Early exit for identical currencies
    if (fromCurrencyId === toCurrencyId) {
      return {
        success: true,
        data: {
          id: "SYNTHETIC",
          date: new Date(date),
          fromCurrencyId,
          toCurrencyId,
          rate: new Decimal(1),
        },
        message: "Base and target currencies are identical",
      };
    }

    // 2. Validate currencies first to fail fast
    const [fromCurrency, toCurrency] = await Promise.all([
      tx.currency.findUnique({
        where: { id: fromCurrencyId },
        select: { code: true },
      }),
      tx.currency.findUnique({
        where: { id: toCurrencyId },
        select: { code: true },
      }),
    ]);

    if (!fromCurrency?.code || !toCurrency?.code) {
      return {
        success: false,
        message: "Invalid currency IDs",
        error: {
          missingFrom: !fromCurrency?.code,
          missingTo: !toCurrency?.code,
        },
      };
    }

    // const normalizedDate = new Date(date);
    // normalizedDate.setUTCHours(0, 0, 0, 0);
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setUTCHours(0, 0, 0, 0);
      return normalized;
    };

    // const nextDay = new Date(normalizedDate);
    // nextDay.setDate(nextDay.getDate() + 1);
    const rateLookbackDays = 5;
    const searchDate = normalizeDate(date);
    const searchWindowEnd = new Date(searchDate);
    searchWindowEnd.setUTCDate(searchWindowEnd.getUTCDate() + 1);

    const lookbackStart = new Date(searchDate);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - rateLookbackDays);

    // Check for exact match
    const dbRate = await tx.exchangeRate.findFirst({
      where: {
        fromCurrencyId,
        toCurrencyId,
        date: { gte: lookbackStart, lt: searchWindowEnd },
      },
      select: {
        id: true,
        date: true,
        rate: true,
      },
    });

    if (dbRate) {
      const isSameDay =
        dbRate.date.toISOString().slice(0, 10) ===
        searchDate.toISOString().slice(0, 10);

      return {
        success: true,
        data: { ...dbRate, fromCurrencyId, toCurrencyId },
        message: isSameDay ? "Exact rate" : "Closest rate",
      };
    }

    // const daysAgo = 5;
    // const xDaysAgo = new Date(normalizedDate);
    // xDaysAgo.setDate(xDaysAgo.getDate() - daysAgo);

    // const closestRate = await tx.exchangeRate.findFirst({
    //   where: {
    //     date: { gte: xDaysAgo, lte: nextDay },
    //     fromCurrencyId,
    //     toCurrencyId,
    //   },
    //   select: {
    //     id: true,
    //     date: true,
    //     fromCurrencyId: true,
    //     toCurrencyId: true,
    //     rate: true,
    //   },
    //   orderBy: { date: "desc" },
    // });

    // if (closestRate?.rate) {
    //   console.warn(`Using closest rate from ${closestRate.date.toISOString()}`);
    //   return {
    //     success: true,
    //     message: "Closest rate found",
    //     data: closestRate,
    //   };
    // }

    let apiResponse;
    const apiUrl = `https://open.er-api.com/v6/latest/${fromCurrency.code}`;
    const apiRetryAttempts = 2;

    for (let attempt = 0; attempt <= apiRetryAttempts; attempt++) {
      try {
        apiResponse = await axios.get(apiUrl, { timeout: 3000 });
        if (apiResponse.status === 200) break;
      } catch (error) {
        if (attempt === apiRetryAttempts) {
          return {
            success: false,
            // message: axios.isAxiosError(error)
            //   ? `API Request Failed: ${apiError.message}`
            //   : "Unknown API error",
            // error: error,
            message: axios.isAxiosError(error)
              ? `API failed: ${error.code}`
              : "API error",
            error: axios.isAxiosError(error) ? error.toJSON() : error,
          };
        }
      }
    }

    // if (apiResponse.status !== 200 || !apiResponse.data.rates) {
    //   return {
    //     success: false,
    //     message: `API Error: Unable to fetch exchange rate (${apiResponse.statusText})`,
    //     error: apiResponse.statusText,
    //   };
    // }
    const apiData = apiResponse?.data;

    if (!apiData?.rates || !apiData.time_last_update_unix) {
      return {
        success: false,
        message: "Invalid API response",
        error: apiData,
      };
    }
    const apiRate = apiData.rates[toCurrency.code];

    if (!apiRate) {
      return {
        success: false,
        message: `Currency pair ${fromCurrency.code} → ${toCurrency.code} not found in API response`,
        error: { from: fromCurrency.code, to: toCurrency.code },
      };
    }

    const ratePrecision = 9;
    const processedRate = new Decimal(apiRate).toDecimalPlaces(ratePrecision);
    const rateDate = new Date(apiData.time_last_update_unix * 1000);
    rateDate.setUTCHours(0, 0, 0, 0);

    // const newRateItem: ExRateItem = {
    //   date: new Date(time_last_update_unix * 1000),
    //   fromCurrencyId,
    //   toCurrencyId,
    //   rate: new Decimal(apiRate),
    // };

    try {
      const persistedRate = await tx.exchangeRate.upsert({
        where: {
          fromCurrencyId_toCurrencyId_date: {
            fromCurrencyId,
            toCurrencyId,
            date: rateDate,
          },
        },
        create: {
          date: rateDate,
          fromCurrencyId,
          toCurrencyId,
          rate: processedRate,
        },
        update: {},
        select: { id: true, date: true, rate: true },
      });

      return {
        success: true,
        data: { ...persistedRate, fromCurrencyId, toCurrencyId },
        message: "API rate persisted",
      };
    } catch (dbError: any) {
      const isDuplicate =
        dbError.code === "P2002" || // Prisma known request error code
        dbError.message?.includes("duplicate key value");

      if (isDuplicate) {
        console.warn(
          `Exchange rate for ${fromCurrencyId} → ${toCurrencyId} on ${rateDate.toISOString()} already exists. Skipping insert.`
        );

        // Try to fetch and return the existing one
        const existingRate = await tx.exchangeRate.findFirst({
          where: {
            fromCurrencyId,
            toCurrencyId,
            date: rateDate,
          },
          select: {
            id: true,
            date: true,
            fromCurrencyId: true,
            toCurrencyId: true,
            rate: true,
          },
        });

        if (existingRate) {
          return {
            success: true,
            data: existingRate,
            message: "Rate already existed. Fetched existing.",
          };
        }
      }

      return {
        success: false,
        message: "Failed to persist rate to database",
        error: dbError,
      };
    }
  } catch (error) {
    console.error("Error getting exchange rate:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      error: error instanceof Error ? error : undefined,
    };
  }
}
