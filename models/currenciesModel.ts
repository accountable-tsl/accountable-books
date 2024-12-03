import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function getAllCurrencies() {
  try {
    const currencies = await prisma.currency.findMany();

    if (currencies.length === 0) {
      return {
        success: false,
        message: "No currency found",
      };
    }

    return {
      success: true,
      message: "Successfully retrieved all currencies",
      data: currencies,
    };
  } catch (error: any) {
    console.error(error.message || error);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}
