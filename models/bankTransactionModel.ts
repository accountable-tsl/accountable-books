import { DefaultSide, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const prisma = new PrismaClient();

export interface BankTransaction {
  id?: string;
  date: Date | string;
  description?: string | null;
  amount: Decimal;
  payee?: string | null;
  reference?: string | null;
  type?: DefaultSide | null;
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
    const result = prisma.$transaction(async (prisma) => {
      //1. Fetch the relevant bank account
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: bankAccountId },
        include: { transactionBatches: true },
      });

      if (!bankAccount)
        return { success: false, message: "Bank Account not found" };

      //2. Calculate Balance on account before new transactions
      const existingTransactions = await prisma.bankTransaction.findMany({
        where: { bankAccountId },
        orderBy: { date: "asc" },
      });

      const balanceBefore = existingTransactions.reduce(
        (total: Decimal, transaction: { amount: Decimal }) =>
          total.plus(transaction.amount),
        new Decimal(0)
      );

      //3. Calculate batchTotal and include balance and bankAccountId on each transaction
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
          balance: new Decimal(currentRunningBalance),
          bankAccountId: bankAccountId,
        };
      });

      //4. Confirm that balanceAfter is same as currentRunningBalance
      const balanceAfter = balanceBefore.plus(batchTotal);

      if (!balanceAfter.equals(currentRunningBalance)) {
        console.log(preparedTransactions);
        return {
          success: false,
          message: "Arithmetic error occured. Inaccurate balance",
          data: preparedTransactions,
        };
      }

      //5. Write batch and transactions to database
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
              balance: transaction.balance,
              bankAccount: { connect: { id: String(bankAccountId) } },
              ...(transaction.type && { type: transaction.type }),
            })),
          },
        },
      });

      //6. Recalculate running balance and update each transaction
      let runningBalance = new Decimal(0);

      const allTransactions: BankTransaction[] =
        await prisma.bankTransaction.findMany({
          where: { bankAccountId },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        });

      allTransactions.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      for (const transaction of allTransactions) {
        runningBalance = runningBalance.plus(transaction.amount);

        await prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: { balance: runningBalance },
        });
      }

      console.log({
        balanceBefore: balanceBefore,
        batchTotal: batchTotal,
        balanceAfter: balanceAfter,
        currentRunningBalance: currentRunningBalance,
        runningBalance: runningBalance,
      });

      //7. Update bankAccount balance and balanceAfter
      await prisma.bankAccount.update({
        where: { id: String(bankAccountId) },
        data: {
          bankBalance: runningBalance,
        },
      });

      // await prisma.bankTransactionBatch.update({
      //   where: { id: String(bankTransactionBatch.id) },
      //   data: {
      //     balanceAfter: runningBalance,
      //   },
      // });

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
