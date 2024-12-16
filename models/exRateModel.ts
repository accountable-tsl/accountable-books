import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const prisma = new PrismaClient();

export interface ExRateItem {
  date: Date;
  baseCurrencyId: string;
  targetCurrencyId: string;
  rate: Decimal;
}
export async function createNewExRates(data: ExRateItem[]) {
  try {
    const result = await prisma.exchangeRates.createMany({
      data: data,
      skipDuplicates: true,
    });

    return {
      success: true,
      message: `${data.length} rows processed. Duplicates skipped.`,
    };
  } catch (error) {
    console.error("Error in createNewExRates:", error);
    return { success: false, message: "Failed to create exchange rates" };
  }
}

export async function getExchangeRate(
  date: Date,
  baseCurrencyId: string,
  targetCurrencyId: string
) {
  try {
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const result = await prisma.exchangeRates.findFirst({
      where: { date, baseCurrencyId, targetCurrencyId },
    });

    if (!result) {
      const closestRate = await prisma.exchangeRates.findFirst({
        where: {
          date: { lte: normalizedDate },
          baseCurrencyId,
          targetCurrencyId,
        },
        orderBy: { date: "desc" },
      });

      return closestRate
        ? { success: true, data: closestRate }
        : { success: false, message: "No exchange rate found" };
    }

    return {
      success: true,
      message: "Rate retrieved successfully",
      data: result,
    };
  } catch (error) {
    console.error("Error getting exchange rate:", error);
    return {
      success: false,
      message: "Failed to create exchange rates",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
