import {
  Bank,
  BankAccount,
  BankTransaction,
  CategorisationStatus,
  Coa,
  Company,
  Contact,
  Currency,
  JournalBatch,
  LedgerEntry,
  LedgerTransaction,
  Prisma,
  PrismaClient,
  User,
} from "@prisma/client";
import { TransactionFilters } from "./bankTransactionModel";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

type ExtendedLedgerTransaction = Prisma.LedgerTransactionGetPayload<{
  include: {
    contact: true;
    company: true;
    bankTransaction: {
      include: {
        bankAccount: {
          include: { bank: true };
        };
      };
    };
    journalBatch: true;
    ledgerEntries: {
      include: {
        coa: true;
        sourceCurrency: true;
      };
    };
    createdBy: true;
    updatedBy: true;
  };
}>;

type TransformedLedgerEntry = {
  source: string;
  date: Date | null;
  categorisationStatus?: CategorisationStatus | null;
  bankAccount: {
    id?: string | null;
    displayName?: string | null;
    bankAccountNo?: string | null;
    coaId?: string | null;
    currencyId?: string | null;
    bankId?: string | null;
    bankName?: string | null;
    bankLogo?: string | null | undefined;
    bankBalance?: Decimal;
  };
  bankTransaction?: {
    id?: string | null;
    date?: Date;
    contact?: string | null;
    description?: string | null;
    reference?: string | null;
    amount?: Decimal;
    defaultExchangeRate?: Decimal;
    bankTransactionBatchId?: string | null;
    ledgerTransactionId?: string | null;
  };
  ledgerTransaction: {
    id: string;
    date: Date | null;
    description?: string | null;
    reference?: string | null;
    notes?: string | null;
  };
  contact?: Contact | null;
  journalBatch?: JournalBatch | null;
  company?: Company | null;
};

const buildBankTransactionFilters = (
  companyId: string,
  filters: TransactionFilters
) => {
  const where: Prisma.BankTransactionWhereInput = {
    isDeleted: filters.isDeleted ?? false,
    ledgerTransactionId: null,
    bankAccount: {
      companyId: companyId,
    },
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
    (where as any).body = { search: filters.searchQuery, mode: "insensitive" };
  }

  if (filters.transactionSide) where.transactionSide = filters.transactionSide;

  return where;
};
const buildLedgerTransactionFilters = (
  companyId: string,
  filters: TransactionFilters
) => {
  const where: Prisma.LedgerTransactionWhereInput = {
    bankTransactionId: { not: null },
    ledgerEntries: {
      some: {
        coa: {
          companyId: companyId,
        },
        isDeleted: filters.isDeleted ?? false,
      },
    },
  };

  const ledgerEntries = where.ledgerEntries?.some;

  const statuses = filters.categorisationStatus || [
    "AUTO_CATEGORISED",
    "CATEGORISED",
  ];
  where.categorisationStatus = { in: statuses };

  if (filters.bankAccountId) {
    where.bankTransaction = { bankAccount: { id: filters.bankAccountId } };
  }

  if (ledgerEntries) {
    if (filters.startDate || filters.endDate) {
      ledgerEntries.fsDate = {};
      if (filters.startDate) ledgerEntries.fsDate.gte = filters.startDate;
      if (filters.endDate) ledgerEntries.fsDate.lte = filters.endDate;
    }

    if (filters.minAmount || filters.maxAmount) {
      ledgerEntries.absoluteSourceAmount = {};
      if (filters.minAmount)
        ledgerEntries.absoluteSourceAmount.gte = filters.minAmount;
      if (filters.maxAmount)
        ledgerEntries.absoluteSourceAmount.lte = filters.maxAmount;
    }

    if (filters.searchQuery) {
      (ledgerEntries as any).body = {
        search: filters.searchQuery,
        mode: "insensitive",
      };
    }

    if (filters.transactionSide)
      ledgerEntries.transactionSide = filters.transactionSide;
  }

  return where;
};

const transformLedgerTransaction = (
  tx: ExtendedLedgerTransaction
): TransformedLedgerEntry[] => {
  const bankCoaId = tx.bankTransaction?.bankAccount?.coaId;

  return Array.isArray(tx.ledgerEntries)
    ? tx.ledgerEntries
        .filter((entry) => entry.coaId !== bankCoaId)
        .map(
          ({
            sourceCurrency,
            bankTransaction,
            ...rest
          }: LedgerEntry & {
            sourceCurrency?: Currency;
            bankTransaction?: BankTransaction;
          }) => ({
            source: "ledgerTransaction",
            date: tx.date,
            categorisationStatus: tx.categorisationStatus,
            ...rest,
            bankAccount: {
              id: tx.bankTransaction?.bankAccount?.id,
              displayName: tx.bankTransaction?.bankAccount?.displayName,
              bankAccountNo: tx.bankTransaction?.bankAccount?.bankAccountNo,
              coaId: tx.bankTransaction?.bankAccount?.coaId,
              currencyId: tx.bankTransaction?.bankAccount?.currencyId,
              bankId: tx.bankTransaction?.bankAccount?.bankId,
              bankName: tx.bankTransaction?.bankAccount?.bank?.name,
              bankLogo: tx.bankTransaction?.bankAccount?.bank?.bankLogo,
              bankBalance: tx.bankTransaction?.bankAccount?.bankBalance,
            },
            bankTransaction: {
              id: tx.bankTransaction?.id,
              date: tx.bankTransaction?.date,
              contact: tx.bankTransaction?.payee,
              description: tx.bankTransaction?.description,
              reference: tx.bankTransaction?.reference,
              amount: tx.bankTransaction?.amount,
              defaultExchangeRate: tx.bankTransaction?.defaultExchangeRate,
              bankTransactionBatchId:
                tx.bankTransaction?.bankTransactionBatchId,
              ledgerTransactionId: tx.bankTransaction?.ledgerTransactionId,
            },
            ledgerTransaction: {
              id: tx.id,
              date: tx.date,
              description: tx.description,
              reference: tx.reference,
              notes: tx.notes,
            },
            contact: tx.contact,
            journalBatch: tx.journalBatch,
            company: tx.company,
          })
        )
    : [];
};

export async function getMergedTransactions(
  companyId: string,
  filters: TransactionFilters
) {
  try {
    const bankTransactionFilters = buildBankTransactionFilters(
      companyId,
      filters
    );

    const ledgerTransactionFilters = buildLedgerTransactionFilters(
      companyId,
      filters
    );

    //Dynamically add other filters

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 100;

    const bankTransactions = await prisma.bankTransaction.findMany({
      where: bankTransactionFilters,
      include: {
        categorisedBy: true,
        bankAccount: {
          include: {
            bank: true,
            currency: true,
            company: true,
            accountInCoa: true,
          },
        },
        bankTransactionBatch: true,
        ledgerTransaction: true,
        createdBy: true,
        updatedBy: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    const accountTransactions = await prisma.ledgerTransaction.findMany({
      where: ledgerTransactionFilters,
      include: {
        contact: true,
        company: true,
        bankTransaction: {
          include: { bankAccount: { include: { bank: true } } },
        },
        journalBatch: true,
        ledgerEntries: { include: { coa: true, sourceCurrency: true } },
        createdBy: true,
        updatedBy: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    console.log(accountTransactions);

    const flattenedAccountTransactions: TransformedLedgerEntry[] =
      accountTransactions.flatMap(transformLedgerTransaction);

    console.log(flattenedAccountTransactions);

    // Filter out ledger entries where coaId matches the bank account's coaId
    // This ensures we only get contra entries, not the bank account entries

    const transactions = [
      ...bankTransactions.map((bankTx) => ({
        ...bankTx,
        source: "bankTransaction",
      })),
      ...flattenedAccountTransactions,
    ];

    const count = transactions.length;

    return {
      success: true,
      message: "Bank transactions retrieved successfully",
      data: { transactions, count, page, pageSize },
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
