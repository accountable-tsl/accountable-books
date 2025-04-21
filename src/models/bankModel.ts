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
      bankId: bank.id,
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

interface CreateBank {
  name: string;
  bankLogo?: string;
  countryId: number;
}

const baseUrl = `${process.env.BACKEND_URL}:${process.env.PORT}`;
const defaultBankLogo = `${baseUrl}/bank-default.png`;

export async function createNewBank(data: CreateBank) {
  try {
    const newBank = await prisma.bank.create({
      data: {
        name: data.name,
        bankLogo: data.bankLogo || defaultBankLogo,
        countryId: data.countryId,
      },
    });

    return {
      success: true,
      message: "Bank created successfully",
      data: newBank,
    };
  } catch (error) {
    console.error("Error creating bank:", error);
    return {
      success: false,
      message: "Failed to create bank",
    };
  }
}

export async function updateBankData(id: number, data: CreateBank) {
  try {
    const bankToUpdate = await prisma.bank.findUnique({ where: { id } });

    if (!bankToUpdate) {
      return {
        success: false,
        message: `Bank with id ${id} not found`,
      };
    }

    const updatedBank = await prisma.bank.update({
      where: { id },
      data: {
        name: data.name,
        bankLogo: data.bankLogo || defaultBankLogo,
        countryId: data.countryId,
      },
    });

    const changes = {
      ...(bankToUpdate.name !== updatedBank.name
        ? { name: bankToUpdate.name }
        : {}),
      ...(bankToUpdate.bankLogo !== updatedBank.bankLogo
        ? { bankLogo: bankToUpdate.bankLogo }
        : {}),
      ...(bankToUpdate.countryId !== updatedBank.countryId
        ? { countryId: bankToUpdate.countryId }
        : {}),
    };

    const noChanges = !changes.name && !changes.bankLogo && !changes.countryId;
    if (noChanges) {
      return {
        success: true,
        message: `No changes were made to bank ${id}`,
        data: updatedBank,
      };
    }

    return {
      success: true,
      message: `Bank with id:${id} successfully updated`,
      data: { ...updatedBank, changes },
    };
  } catch (error: any) {
    console.error("Error updating bank", error);
    return {
      success: false,
      message: "Internal Server Error",
    };
  }
}
