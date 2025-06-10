import {
  CategorisationStatus,
  DebitCredit,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { getSingleExchangeRate } from "../controllers/exRateController";
import { fetchExchangeRate } from "./exRateModel";
import { determineExchangeRate, getIdentifierType } from "../utils/utils-old";
import knexInstance from "../knexClient";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

export interface BankTransaction {
  id?: string;
  date: Date | string;
  amount: Decimal;
  description?: string | null;
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

export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  bankAccountId?: string;
  minAmount?: Decimal;
  maxAmount?: Decimal;
  categorisationStatus: CategorisationStatus[];
  isDeleted?: boolean;
  searchQuery?: string;
  transactionSide?: DebitCredit;
  currentPage?: number;
  pageSize?: number;
  offset?: number;
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
    const result = await knexInstance.transaction(async (trx) => {
      // const result = prisma.$transaction(async (prisma) => {
      //1. Fetch the relevant bank account
      // const bankAccount = await prisma.bankAccount.findUnique({
      //   where: { id: bankAccountId },
      //   include: { transactionBatches: true, company: true },
      // });
      const bankAccount = await trx("BankAccount")
        .select("BankAccount.*", trx.raw('to_jsonb("companies") as company'))
        .leftJoin("companies", "BankAccount.companyId", "Company.id")
        .where("BankAccount.id", bankAccountId)
        .first();

      if (!bankAccount)
        return { success: false, message: "Bank Account not found" };

      //2. Calculate Balance on account before new transactions
      // const existingTransactions = await prisma.bankTransaction.findMany({
      //   where: { bankAccountId },
      //   orderBy: { date: "asc" },
      // });
      const existingTransactions = await trx("BankTransaction")
        .where({ bankAccountId })
        .orderBy("date", "asc");

      const balanceBefore = existingTransactions.reduce(
        (total: Decimal, txn: any) => total.plus(new Decimal(txn.amount)),
        new Decimal(0)
      );

      //3. Calculate batchTotal and include balance and bankAccountId on each transaction
      bankTransactions.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      let currentRunningBalance = balanceBefore;
      let batchTotal = new Decimal(0);

      const preparedTransactions = await Promise.all(
        bankTransactions.map(async (transaction) => {
          const txnAmount = new Decimal(transaction.amount);

          batchTotal = batchTotal.plus(txnAmount);
          currentRunningBalance = currentRunningBalance.plus(txnAmount);

          const exr = await determineExchangeRate(
            transaction.date,
            bankAccount.company.reportingCurrencyId,
            bankAccount.currencyId
          );

          if (exr === null) {
            throw new Error(
              `Exchange rate not available for ${transaction.date}: ${bankAccount.company.reportingCurrencyId} to ${bankAccount.currencyId}`
            );
          }

          return {
            ...transaction,
            id: randomUUID(), // Required since Prisma's @default(uuid()) won't run in Knex. Remove once prisma is fully migrated
            amount: new Decimal(transaction.amount),
            absoluteAmount: new Decimal(transaction.amount).abs(),
            balance: new Decimal(currentRunningBalance),
            bankAccountId: bankAccountId,
            systemExchangeRate: exr,
            createdById: createdById,
            updatedById: createdById,
          };
        })
      );

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

      const [bankTransactionBatch] = await trx("BankTransactionBatch")
        .insert({
          id: randomUUID(), // Handle with Knex later. Using this coz @uuid() in prisma will not work since we're running this with knex
          startDate,
          endDate,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          source,
          bankAccountId: String(bankAccountId),
          createdById: String(createdById),
          updatedById: String(createdById),
          createdAt: knexInstance.fn.now(), // Should be handled by knex later
          updatedAt: knexInstance.fn.now(), // Should be handled by knex later
        })
        .returning("*");

      await trx("BankTransaction").insert(
        preparedTransactions.map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          bankTransactionBatchId: bankTransactionBatch.id,
          payee: transaction.payee || null,
          reference: transaction.reference || null,
          description: transaction.description || null,
          amount: transaction.amount.toNumber(),
          systemExchangeRate: transaction.systemExchangeRate.toNumber(),
          absoluteAmount: transaction.absoluteAmount.toNumber(),
          bankAccountId: String(bankAccountId),
          createdById: String(createdById),
          updatedById: String(createdById),
          createdAt: knexInstance.fn.now(), // Should be handled by knex later
          updatedAt: knexInstance.fn.now(), // Should be handled by knex later
          transactionSide: transaction.amount.lt(0)
            ? DebitCredit.CREDIT
            : DebitCredit.DEBIT,
        }))
      );

      // const allTransactions: BankTransaction[] =
      //   await prisma.bankTransaction.findMany({
      //     where: { bankAccountId },
      //     orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      //   });

      // allTransactions.sort(
      //   (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      // );

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
  filters: TransactionFilters
): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
  error?: unknown;
}> {
  try {
    //Define a base "where" object
    // const where: any = {
    //   bankAccount: {
    //     companyId: companyId,
    //   },
    //   isDeleted: filters.isDeleted ?? false,
    // };

    // Build the base query.
    let baseQuery = knexInstance("BankTransaction")
      .join("BankAccount", "BankTransaction.bankAccountId", "BankAccount.id")
      .leftJoin("Bank", "BankAccount.bankId", "Bank.id")
      .leftJoin("currencies", "BankAccount.currencyId", "Currency.id")
      // Filter by company using BankAccount.companyId:
      .where("BankAccount.companyId", companyId)
      // Default BankTransaction isDeleted filter
      .andWhere("BankTransaction.isDeleted", filters.isDeleted ?? false);

    //Dynamically add other filters
    // if (filters.bankAccountId) where.bankAccountId = filters.bankAccountId;
    if (filters.bankAccountId) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.bankAccountId",
        filters.bankAccountId
      );
    }
    // if (filters.startDate || filters.endDate) {
    //   where.date = {};
    //   if (filters.startDate) where.date.gte = filters.startDate;
    //   if (filters.endDate) where.date.lte = filters.endDate;
    // }
    if (filters.startDate) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.date",
        ">=",
        filters.startDate
      );
    }
    if (filters.endDate) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.date",
        "<=",
        filters.endDate
      );
    }

    // if (filters.minAmount || filters.maxAmount) {
    //   where.absoluteAmount = {};
    //   if (filters.minAmount) where.absoluteAmount.gte = filters.minAmount;
    //   if (filters.maxAmount) where.absoluteAmount.lte = filters.maxAmount;
    // }

    if (filters.minAmount) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.absoluteAmount",
        ">=",
        filters.minAmount
      );
    }
    if (filters.maxAmount) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.absoluteAmount",
        "<=",
        filters.maxAmount
      );
    }

    // if (filters.searchQuery) {
    //   where.body = { search: filters.searchQuery };
    // }
    if (filters.searchQuery) {
      baseQuery = baseQuery.andWhereRaw(
        `to_tsvector('english', coalesce("BankTransaction"."reference", '') || ' ' || coalesce("BankTransaction"."narration", '') || ' ' || coalesce("BankTransaction"."description", '')) @@ plainto_tsquery(?)`,
        [filters.searchQuery]
      );
    }

    // if (filters.transactionSide)
    //   where.transactionSide = filters.transactionSide;
    if (filters.transactionSide) {
      baseQuery = baseQuery.andWhere(
        "BankTransaction.transactionSide",
        filters.transactionSide
      );
    }

    const page = filters.currentPage || 1;
    const pageSize = filters.pageSize || 100;
    const offset = (page - 1) * pageSize;

    // const transactions = await prisma.bankTransaction.findMany({
    //   where,
    //   include: { bankAccount: { include: { bank: true, currency: true } } },
    //   orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    //   // skip: (page - 1) * pageSize,
    //   // take: pageSize,
    // });

    const transactionsQuery = baseQuery
      .clone()
      .clearSelect()
      .select("BankTransaction.*")
      .select(
        knexInstance.raw(
          `to_jsonb("BankAccount") || jsonb_build_object(
          'bank', to_jsonb("banks"),
          'currency', to_jsonb("currencies")
        ) as "bankAccount"`
        )
      )
      .orderBy("BankTransaction.date", "asc")
      .orderBy("BankTransaction.createdAt", "asc");
    // .offset(offset)
    // .limit(pageSize);

    // const total = await prisma.bankTransaction.count({ where }); //Total no of transactions matching filter
    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .countDistinct("BankTransaction.id as total")
      .first();

    const [transactions, countResult] = await Promise.all([
      transactionsQuery,
      countQuery,
    ]);

    const total = countResult ? parseInt(String(countResult.total), 10) : 0;

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

export async function getBankTransactionById(
  companyId: string,
  bankTransactionId: string
) {
  try {
    const companyIdType = getIdentifierType(companyId);

    let query = knexInstance("BankTransaction")
      .select("BankTransaction.*")
      .select(knexInstance.raw('to_jsonb("BankAccount") as "bankAccount"'))
      .where("BankTransaction.id", bankTransactionId)
      .join("BankAccount", "BankTransaction.bankAccountId", "BankAccount.id");

    if (companyIdType === "uuid") {
      query = query.andWhere("BankAccount.companyId", companyId);
    } else {
      query = query
        .join("companies", "BankAccount.companyId", "Company.id")
        .andWhere("Company.shortCode", companyId);
    }

    const result = await query.first();

    if (!result) {
      return {
        success: false,
        message: `Bank transaction with ID ${bankTransactionId} not found for company ${companyId}`,
      };
    }

    return {
      success: true,
      message: `Bank transaction with id ${bankTransactionId} retrieved successfully`,
      data: result,
    };
  } catch (error: any) {
    console.error("Error retrieving bank transaction", error);
    return {
      success: false,
      message: "Failed to retrieve transactions",
      error: error.message,
    };
  }
}
