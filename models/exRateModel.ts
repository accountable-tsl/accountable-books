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

    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const nextDay = new Date(normalizedDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Check for exact match
    const exactRate = await tx.exchangeRate.findFirst({
      where: {
        date: { gte: normalizedDate, lt: nextDay },
        fromCurrencyId,
        toCurrencyId,
      },
      select: {
        id: true,
        date: true,
        fromCurrencyId: true,
        toCurrencyId: true,
        rate: true,
      },
    });

    if (exactRate) {
      return {
        success: true,
        data: exactRate,
        message: "Exact rate found",
      };
    }

    const daysAgo = 3;
    const xDaysAgo = new Date(normalizedDate);
    xDaysAgo.setDate(xDaysAgo.getDate() - daysAgo);


    const closestRate = await tx.exchangeRate.findFirst({
      where: {
        date: { gte: xDaysAgo, lte: nextDay },
        fromCurrencyId,
        toCurrencyId,
      },
      select: {
        id: true,
        date: true,
        fromCurrencyId: true,
        toCurrencyId: true,
        rate: true,
      },
      orderBy: { date: "desc" },
    });

    if (closestRate?.rate) {
      console.warn(`Using closest rate from ${closestRate.date.toISOString()}`);
      return {
        success: true,
        message: "Closest rate found",
        data: closestRate,
      };
    }

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
        message: "Invalid currency identifiers",
        error: { fromCurrencyId, toCurrencyId },
      };
    }

    const apiUrl = `https://open.er-api.com/v6/latest/${fromCurrency.code}`;
    let apiResponse;
    try {
      apiResponse = await axios.get(apiUrl);
    } catch (apiError) {
      return {
        success: false,
        message: axios.isAxiosError(apiError)
          ? `API Request Failed: ${apiError.message}`
          : "Unknown API error",
        error: apiError,
      };
    }

    if (apiResponse.status !== 200 || !apiResponse.data.rates) {
      return {
        success: false,
        message: `API Error: Unable to fetch exchange rate (${apiResponse.statusText})`,
        error: apiResponse.statusText,
      };
    }

    const { rates, time_last_update_unix } = apiResponse.data;
    const apiRate = rates[toCurrency.code];

    if (!apiRate) {
      return {
        success: false,
        message: `Currency pair ${fromCurrency.code} → ${toCurrency.code} not found in API response`,
        error: { from: fromCurrency.code, to: toCurrency.code },
      };
    }

    const newRateItem: ExRateItem = {
      date: new Date(time_last_update_unix * 1000),
      fromCurrencyId,
      toCurrencyId,
      rate: new Decimal(apiRate),
    };

    try {
      const persistedRate = await tx.exchangeRate.create({
        data: newRateItem,
      });

      return {
        success: true,
        data: persistedRate,
        message: "Rate fetched from API and saved",
      };
    } catch (dbError) {
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
