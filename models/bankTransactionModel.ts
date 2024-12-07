import { PrismaClient } from "@prisma/client";
import { BankTransaction } from "../controllers/bankTransactionControllers";

const prisma = new PrismaClient();

interface BankTransactionBatchData {
  startDate: Date;
  endDate: Date;
  source: "FILE_IMPORT" | "BANK_FEED" | "MANUAL_ENTRY";
  bankAccountId: string;
  bankTransactions: BankTransaction[];
  createdById: string;
}

export async function postBankTransactions(
  companyId: string | number,
  data: BankTransactionBatchData
) {
  const {
    startDate,
    endDate,
    source,
    bankAccountId,
    bankTransactions,
    createdById,
  } = data;

  try {
    const result = prisma.$transaction(async (prisma: any) => {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: bankAccountId },
        include: { transactionBatches: true },
      });

      if (!bankAccount)
        return { success: false, message: "Bank Account not found" };

      const balanceBefore = bankAccount.bankBalance.toNumber();

      let currentRunningBalance = balanceBefore;
      let batchTotal = 0;

      const preparedTransactions = bankTransactions.map((transaction) => {
        batchTotal += transaction.amount;
        currentRunningBalance += transaction.amount;

        return {
          ...transaction,
          balance: currentRunningBalance,
        };
      });

      const balanceAfter = balanceBefore + batchTotal;

      if (balanceAfter !== currentRunningBalance) {
        return {
          success: false,
          message: "Arithmetic error occured. Inaccurate balance",
        };
      }

      const bankTransactionBatch = await prisma.bankTransactionBatch.create({
        data: {
          startDate,
          endDate,
          balanceBefore,
          balanceAfter,
          source,
          bankAccountId: String(bankAccountId),
          createdById: String(createdById),
          updatedById: String(createdById),
          bankTransactions: {
            create: preparedTransactions.map((transaction) => ({
              date: transaction.date,
              description: transaction.description || null,
              amount: transaction.amount,
              payee: transaction.payee || null,
              reference: transaction.reference || null,
              type: transaction.type,
              balance: transaction.balance,
            })),
          },
        },
      });

      await prisma.bankAccount.update({
        where: { id: String(bankAccountId) },
        data: {
          bankBalance: balanceAfter,
        },
      });

      return {
        success: true,
        message: "Transactions posted successfully",
        data: { bankTransactionBatch },
      };
    });

    return result;
  } catch (error) {
    console.error("Error posting bank transactions:", error);
    return { success: false, message: "Failed to post transactions", error };
  }
}
