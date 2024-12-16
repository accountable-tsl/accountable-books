import { DebitCredit, Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const prisma = new PrismaClient();

export interface BankTransaction {
  id?: string;
  date: Date | string;
  description?: string | null;
  amount: Decimal;
  payee?: string | null;
  reference?: string | null;
  transactionSide?: DebitCredit | null;
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

export interface BankTransactionFilters {
  startDate?: Date;
  endDate?: Date;
  bankAccountId?: string;
  minAmount?: Decimal;
  maxAmount?: Decimal;
  isCategorised?: boolean;
  isDeleted?: boolean;
  searchQuery?: string;
  transactionSide?: DebitCredit;
  page?: number;
  pageSize?: number;
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
          amount: new Decimal(transaction.amount),
          absoluteAmount: new Decimal(transaction.amount).abs(),
          balance: new Decimal(currentRunningBalance),
          bankAccountId: bankAccountId,
        };
      });

      //4. Confirm that balanceAfter is same as currentRunningBalance
      const balanceAfter = balanceBefore.plus(batchTotal);

      if (!balanceAfter.equals(currentRunningBalance)) {
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
              absoluteAmount: transaction.absoluteAmount,
              payee: transaction.payee || null,
              reference: transaction.reference || null,
              balance: transaction.balance,
              bankAccount: { connect: { id: String(bankAccountId) } },
              ...(transaction.transactionSide && {
                transactionSide: transaction.transactionSide,
              }),
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

      // console.log({
      //   balanceBefore: balanceBefore,
      //   batchTotal: batchTotal,
      //   balanceAfter: balanceAfter,
      //   currentRunningBalance: currentRunningBalance,
      //   runningBalance: runningBalance,
      // });

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

export async function getBankTransactions(
  companyId: string | number,
  filters: BankTransactionFilters
): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
  error?: unknown;
}> {
  try {
    //Define a base "where" object
    const where: any = {
      bankAccount: {
        companyId: companyId,
      },
      isCategorised: filters.isCategorised ?? false,
      isDeleted: filters.isDeleted ?? false,
    };

    //Dynamically add other filters
    if (filters.bankAccountId) where.bankAccountId = filters.bankAccountId;

    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }
    //gte means "greater than or equal to"
    //lte means "less than or equal to"

    if (filters.minAmount || filters.maxAmount) {
      where.absoluteAmount = {};
      if (filters.minAmount) where.absoluteAmount.gte = filters.minAmount;
      if (filters.maxAmount) where.absoluteAmount.lte = filters.maxAmount;
    }

    if (filters.searchQuery) {
      where.body = { search: filters.searchQuery };
    }

    if (filters.transactionSide)
      where.transactionSide = filters.transactionSide;

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 100;

    const transactions = await prisma.bankTransaction.findMany({
      where,
      include: { bankAccount: { include: { bank: true, currency: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const total = await prisma.bankTransaction.count({ where }); //Total no of transactions matching filter

    return {
      success: true,
      message: "Bank transactions retrieved successfully",
      data: { transactions, total, page, pageSize },
    };
  } catch (error) {
    console.error("Error retrieving bank transactions:", filters, error);
    return {
      success: false,
      message: "Failed to retrieve transactions",
      error,
    };
  }
}
