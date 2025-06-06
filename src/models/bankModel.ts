import { PrismaClient } from "@prisma/client";
import { ENV } from "../config/env";

const prisma = new PrismaClient();


interface CreateBank {
  name: string;
  bankLogo?: string;
  countryId: number;
}

const baseUrl = ENV.BACKEND_URL;
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
