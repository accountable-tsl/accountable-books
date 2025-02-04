import { PrismaClient } from "@prisma/client";
import { createCOAModel } from "./coaModel";
import { BankAccountType } from "@prisma/client/wasm";

const prisma = new PrismaClient();

export async function getAllBankAccounts(companyId: string) {
  try {
    const allBankAccounts = await prisma.bankAccount.findMany({
      where: { companyId },
      include: {
        bank: true,
        currency: true,
      },
    });

    const noOfAccounts = allBankAccounts.length;

    if (noOfAccounts === 0) {
      return {
        success: false,
        message: "No bank accounts found",
      };
    }

    const bankAccountsWithCounts = await Promise.all(
      allBankAccounts.map(async (account) => {
        const [
          totalTransactionCount,
          uncategorisedCount,
          categorisedCount,
          autoCategorisedCount,
        ] = await Promise.all([
          prisma.bankTransaction.count({
            where: { bankAccountId: account.id },
          }),
          prisma.bankTransaction.count({
            where: {
              bankAccountId: account.id,
              categorisationStatus: "UNCATEGORISED",
            },
          }),
          prisma.bankTransaction.count({
            where: {
              bankAccountId: account.id,
              categorisationStatus: "CATEGORISED",
            },
          }),
          prisma.bankTransaction.count({
            where: {
              bankAccountId: account.id,
              categorisationStatus: "AUTO_CATEGORISED",
            },
          }),
        ]);

        return {
          ...account,
          totalTransactionCount,
          uncategorisedCount,
          categorisedCount,
          autoCategorisedCount,
        };
      })
    );

    return {
      success: true,
      message: "Successfully retrieved all bank accounts",
      data: { bankAccounts: bankAccountsWithCounts, noOfAccounts },
    };
  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      message: "An unexpected error occured",
    };
  }
}

export async function getSingleBankAccount(companyId: string, id: string) {
  try {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { companyId, id },
      include: { bank: true, currency: true },
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
  bankId: string;
  displayName: string;
  bankAccountType: BankAccountType;
  bankAccountNo: string;
  currencyId: string;
}

export async function createNewBankAccount(
  companyId: string,
  data: CreateBankData
) {
  try {
    const [bank, currency] = await Promise.all([
      prisma.bank.findUnique({ where: { id: data.bankId } }),
      prisma.currency.findUnique({ where: { id: data.currencyId } }),
    ]);

    if (!bank) {
      return {
        success: false,
        message: "BankId incorrect",
      };
    }

    if (!currency) {
      return {
        success: false,
        message: "Currency not found",
      };
    }

    const existingBankAccount = await prisma.bankAccount.findFirst({
      where: {
        bankId: data.bankId,
        bankAccountNo: data.bankAccountNo,
        companyId: companyId,
      },
    });

    if (existingBankAccount) {
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

    const result = await prisma.$transaction(async (prisma) => {
      //Create COA entry
      const coa = await createCOAModel(companyId, coaInput);

      if (coa.success && "data" in coa && coa.data?.id) {
        coaId = coa.data.id;
      } else {
        return coa;
      }

      //Create new bank account
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

      //Update COA with Bank Account ID
      await prisma.coa.update({
        where: { id: coaId },
        data: { bankAccountId: newBankAccount.id },
      });

      return {
        success: true,
        message: "Bank account created successfully",
        data: newBankAccount,
      };
    });

    return result;
  } catch (error: unknown) {
    console.error("Error creating bank account:", error);
    return {
      success: false,
      message: "Failed to create bank account",
    };
  }
}

// For bank transaction uploads, remember to check that the transaction did not exist before allowing new upload
