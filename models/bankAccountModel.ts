import { PrismaClient } from "@prisma/client";
import { createCOAModel } from "./coaModel";
import { BankAccountType } from "@prisma/client/wasm";

const prisma = new PrismaClient();

export async function getAllBankAccounts(companyId: number) {
  try {
    const allBankAccounts = await prisma.bankAccount.findMany({
      where: { companyId },
    });

    const noOfAccounts = allBankAccounts.length;

    if (noOfAccounts === 0) {
      return {
        success: false,
        message: "No bank accounts found",
      };
    }

    return {
      success: true,
      message: "Successfully retrieved all bank accounts",
      data: { bankAccounts: allBankAccounts, noOfAccounts },
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "An unexpected error occured",
    };
  }
}

export async function getSingleBankAccount(companyId: number, id: string) {
  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { companyId, id },
    });

    if (!bankAccount) {
      return {
        success: false,
        message: "Bank account not found",
      };
    }

    return {
      success: true,
      message: "Successfully retrieved the bank account",
      data: { bankAccount },
    };
  } catch (error: any) {
    console.error(error.message || error);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}

interface CreateBankData {
  bankId: number;
  displayName: string;
  bankAccountType: BankAccountType;
  bankAccountNo: string;
  currencyId: number;
}

export async function createNewBankAccount(
  companyId: number,
  data: CreateBankData
) {
  try {
    const bank = await prisma.bank.findFirst({ where: { id: data.bankId } });
    if (!bank) {
      return {
        success: false,
        message: "BankId incorrect",
      };
    }

    const currency = await prisma.currency.findFirst({
      where: { id: data.currencyId },
    });
    if (!currency) {
      return {
        success: false,
        message: "Currency not found",
      };
    }

    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        bankId: data.bankId,
        bankAccountNo: data.bankAccountNo,
        companyId: companyId,
      },
    });
    if (bankAccount) {
      return {
        success: false,
        message: "Bank account number already exists",
      };
    }

    let coaId;

    const coaInput = {
      accountName: data.displayName,
      accountTypeName: "Bank",
    };

    const coa = await createCOAModel(companyId, coaInput);
    if (coa.success && "data" in coa && coa.data?.id) {
      coaId = coa.data.id;
    } else {
      return coa;
    }

    const newBankAccount = await prisma.bankAccount.create({
      data: {
        companyId,
        bankId: data.bankId,
        displayName: data.displayName,
        bankAccountType: data.bankAccountType,
        bankAccountNo: data.bankAccountNo,
        currencyId: data.currencyId,
        coaId: coaId,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Bank account created successfully",
      data: newBankAccount,
    };
  } catch (error: any) {
    console.error("Error creating bank account:", error);
    return {
      success: false,
      message: "Failed to create bank account",
    };
  }
}

// For bank transaction uploads, remember to check that the transaction did not exist before allowing new upload
