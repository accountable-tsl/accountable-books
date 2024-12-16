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
