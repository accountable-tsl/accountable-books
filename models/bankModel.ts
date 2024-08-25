import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getAllBanks() {
  try {
    const allBanks = await prisma.bank.findMany({
      select: {
        id: true,
        name: true,
        bankLogo: true,
        country: { select: { id: true, code: true, name: true } },
      },
    });

    const result = allBanks.map((bank: any) => ({
      bankName: bank.name,
      bankLogo: bank.bankLogo,
      countryId: bank.country?.id,
      countryCode: bank.country?.code,
      countryName: bank.country?.name,
    }));

    return {
      success: true,
      message: "Successfully retrieved all banks",
      data: result,
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "An unexpected error occured",
    };
  }
}

export async function getSingleBank(id: number) {
  try {
    const singleBank = await prisma.bank.findFirst({ where: { id } });
    if (singleBank) {
      return {
        success: true,
        message: "Successfully retrieved bank",
        data: singleBank,
      };
    } else {
      return { success: false, message: "Bank not found" };
    }
  } catch (error: any) {
    console.error("Error getting bank", error);
    return { success: false, message: "Internal server error" };
  }
}

export async function createNewBank() {}
