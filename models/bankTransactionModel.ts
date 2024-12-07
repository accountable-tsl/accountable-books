import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const prisma = new PrismaClient();

export interface BankTransaction {
  date: Date | string;
  description?: string;
  amount: Decimal;
  payee?: string;
  reference?: string;
  type?: string;
  bankAccountId?: string;
}

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

      const existingTransactions = await prisma.bankTransaction.findMany({
        where: { bankAccountId },
        orderBy: { date: "asc" },
      });

      const balanceBefore = existingTransactions.reduce(
        (total: Decimal, transaction: { amount: Decimal }) =>
          total.plus(transaction.amount),
        new Decimal(0)
      );

      console.log(balanceBefore);

      // const balanceBefore = bankAccount.bankBalance.toNumber();

      bankTransactions.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      let currentRunningBalance = balanceBefore;
      let batchTotal = new Decimal(0);

      const preparedTransactions = bankTransactions.map((transaction) => {
        batchTotal = batchTotal.plus(transaction.amount);
        currentRunningBalance = currentRunningBalance.plus(transaction.amount);

        return {
          ...transaction,
          balance: currentRunningBalance,
          bankAccountId: bankAccountId,
        };
      });

      const balanceAfter = balanceBefore.plus(batchTotal);

      console.log({ balanceAfter: balanceAfter, batchTotal: batchTotal });

      if (balanceAfter !== currentRunningBalance) {
        console.log(preparedTransactions);
        return {
          success: false,
          message: "Arithmetic error occured. Inaccurate balance",
          data: preparedTransactions,
        };
      }

      const bankTransactionBatch = await prisma.bankTransactionBatch.create({
        data: {
          startDate,
          endDate,
          balanceBefore,
          balanceAfter,
          source,
          bankAccount: { connect: { id: String(bankAccountId) } },
          createdBy: { connect: { id: String(createdById) } },
          updatedBy: { connect: { id: String(createdById) } },
          bankTransactions: {
            create: preparedTransactions.map((transaction) => ({
              date: transaction.date,
              description: transaction.description || null,
              amount: transaction.amount,
              payee: transaction.payee || null,
              reference: transaction.reference || null,
              type: transaction.type,
              balance: transaction.balance,
              bankAccount: { connect: { id: String(bankAccountId) } },
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
