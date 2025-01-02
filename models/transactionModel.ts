import { PrismaClient } from "@prisma/client";
import { TransactionFilters } from "./bankTransactionModel";

const prisma = new PrismaClient();

const buildBankTransactionFilters = (filters: TransactionFilters) => {
  const where: any = {
    isDeleted: filters.isDeleted ?? false,
  };

  const statuses = filters.categorisationStatus || [
    "UNCATEGORISED",
    "AUTO_CATEGORISED",
  ];

  where.categorisationStatus = { in: statuses };

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
    where.body = { search: filters.searchQuery, mode: "insensitive" };
  }

  if (filters.transactionSide) where.transactionSide = filters.transactionSide;

  return where;
};
const buildAccountTransactionFilters = (filters: TransactionFilters) => {
  const where: any = {
    isDeleted: filters.isDeleted ?? false,
  };

  const statuses = filters.categorisationStatus || [
    "AUTO_CATEGORISED",
    "CATEGORISED",
  ];
  where.categorisationStatus = { in: statuses };

  if (filters.bankAccountId) {
    where.bankTransaction = { bankAccount: { id: filters.bankAccountId } };
  }

  if (filters.startDate || filters.endDate) {
    where.date = {};
    if (filters.startDate) where.date.gte = filters.startDate;
    if (filters.endDate) where.date.lte = filters.endDate;
  }

  if (filters.minAmount || filters.maxAmount) {
    where.absoluteAmount = {};
    if (filters.minAmount) where.absoluteSourceAmount.gte = filters.minAmount;
    if (filters.maxAmount) where.absoluteSourceAmount.lte = filters.maxAmount;
  }

  if (filters.searchQuery) {
    where.body = { search: filters.searchQuery, mode: "insensitive" };
  }

  if (filters.transactionSide) where.transactionSide = filters.transactionSide;

  return where;
};

export async function getMergedTransactions(
  companyId: string,
  filters: TransactionFilters
) {
  try {
    //Define a base "where" object
    const where: any = {
      isDeleted: filters.isDeleted ?? false,
    };

    //Dynamically add other filters

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 100;

    const bankTransactions = await prisma.bankTransaction.findMany({
      where: {
        ...where,
        accountTransactionId: null,
        bankAccount: {
          companyId: companyId,
        },
      },
      include: {
        accountTransaction: true,
        bankAccount: { include: { bank: true, currency: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    const accountTransactions = await prisma.accountTransaction.findMany({
      where: { ...where, companyId: companyId },
      include: {
        contact: true,
        sourceCurrency: true,
        project: true,
        debitAccount: true,
        creditAccount: true,
        bankTransaction: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    const allTransactions = [
      ...bankTransactions.map((bankTx) => ({
        ...bankTx,
        source: "bankTransaction",
      })),
      ...accountTransactions.map((accountTx) => ({
        ...accountTx,
        source: "accountTransaction",
      })),
    ];

    const total = allTransactions.length;

    return {
      success: true,
      message: "Bank transactions retrieved successfully",
      data: { allTransactions, total, page, pageSize },
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

export async function createAccountTransactionFromBank(
  bankTransactionId: string,
  coaId: string
) {}
