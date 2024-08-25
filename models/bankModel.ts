import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getAllBanks(companyId: number) {
  try {
    const allBankAccounts = {};
  } catch (error: any) {}
}

export async function getSingleBank(params: type) {}

export async function createNewBank(params: type) {}

//For bank transaction uploads, remember to check that the transaction did not exist before allowing new upload
