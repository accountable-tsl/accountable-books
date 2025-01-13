import {
  CategorisationStatus,
  DebitCredit,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { TransactionFilters } from "./bankTransactionModel";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

type LedgerEntriesWithRelations = Prisma.LedgerEntryGetPayload<{
  include: { coa: true; sourceCurrency: true; project: true };
}>;
type ExtendedLedgerTransaction = Prisma.LedgerTransactionGetPayload<{
  include: {
    contact: { select: { name: true } };
    bankTransaction: {
      include: {
        bankAccount: {
          include: { bank: { select: { name: true; bankLogo: true } } };
        };
      };
    };
    ledgerEntries: {
      include: {
        coa?: { select: { accountCode: true; accountName: true } };
        sourceCurrency?: { select: { code: true } };
        project?: { select: { name: true } };
      };
    };
  };
}>;

type CatEngineTransaction = {
  id: string;
  transactionSource: string;
  categorisationStatus: CategorisationStatus;
  bankLogo: string | null;
  bankName: string | null;
  date: Date;
  fsDate: Date;
  contactName: string;
  reference: string;
  description: string;
  bankCurrencyCode: string;
  bankCurrencyId: string;
  bankCurrencySymbol?: string;
  transactionSide: DebitCredit | null;
  bankAmount: Decimal;
  exchangeRate: Decimal;
  amount: Decimal;
  bankAccountId: string | null;
  bankTransactionBatchId?: string | null;
  ledgerTransactionId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  coaId?: string;
  coaAccountName?: string | null;
  coaAccountCode?: string | null;
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
    isDeleted: filters.isDeleted ?? false,
    ledgerEntries: {
      some: {
        isDeleted: filters.isDeleted ?? false,
        coa: {
          companyId: companyId,
        },
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
): CatEngineTransaction[] => {
  const bankCoaId = tx.bankTransaction?.bankAccount?.coaId;

  return Array.isArray(tx.ledgerEntries)
    ? tx.ledgerEntries
        .filter(
          (entry: LedgerEntriesWithRelations) => entry.coaId !== bankCoaId
        )
        .map(({ ...ledger }: LedgerEntriesWithRelations) => ({
          id: ledger.id,
          transactionSource: "ledger",
          categorisationStatus: tx.categorisationStatus,
          bankLogo: tx.bankTransaction?.bankAccount?.bank?.bankLogo || null,
          bankName: tx.bankTransaction?.bankAccount?.bank?.name || null,
          date: tx.date,
          fsDate: ledger.fsDate,
          contactName: tx.contact?.name || "",
          projectName: ledger.project?.name || null,
          reference: tx.reference || "",
          description: ledger.description || "",
          bankCurrencyCode: ledger.sourceCurrency.code,
          bankCurrencySymbol: ledger.sourceCurrency.symbol,
          transactionSide: ledger.transactionSide,
          bankAmount: ledger.sourceAmount,
          exchangeRate: ledger.customExchangeRate,
          amount: ledger.amount,
          bankCurrencyId: ledger.sourceCurrencyId,
          bankAccountId: tx.bankTransaction?.bankAccountId || null,
          bankTransactionBatchId:
            tx.bankTransaction?.bankTransactionBatchId || null,
          ledgerTransactionId: tx.id,
          contactId: tx.contactId || null,
          projectId: ledger.projectId || null,
          coaId: ledger.coaId,
          coaAccountName: ledger.coa?.accountName || null,
          coaAccountCode: ledger.coa?.accountCode || null,
        }))
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
        // categorisedBy: true,
        bankAccount: {
          include: {
            bank: { select: { bankLogo: true } },
            currency: { select: { id: true, code: true, symbol: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    const accountTransactions = await prisma.ledgerTransaction.findMany({
      where: ledgerTransactionFilters,
      include: {
        contact: { select: { name: true } },
        bankTransaction: {
          include: {
            bankAccount: {
              include: { bank: { select: { name: true, bankLogo: true } } },
            },
          },
        },
        ledgerEntries: {
          include: {
            coa: { select: { accountCode: true, accountName: true } },
            sourceCurrency: { select: { code: true, symbol: true } },
            project: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      // skip: (page - 1) * pageSize,
      // take: pageSize,
    });

    const flattenedAccountTransactions: CatEngineTransaction[] =
      accountTransactions.flatMap(transformLedgerTransaction);

    // Filter out ledger entries where coaId matches the bank account's coaId
    // This ensures we only get contra entries, not the bank account entries

    const transactions: CatEngineTransaction[] = [
      ...bankTransactions.map((bankTx) => ({
        id: bankTx.id,
        transactionSource: "bank",
        categorisationStatus: bankTx.categorisationStatus,
        bankLogo: bankTx.bankAccount?.bank?.bankLogo || null,
        bankName: bankTx.bankAccount?.displayName || null,
        date: bankTx.date,
        fsDate: bankTx.date,
        contactName: bankTx.payee || "",
        reference: bankTx.reference || "",
        description: bankTx.description || "",
        bankCurrencyCode: bankTx.bankAccount?.currency?.code,
        bankCurrencySymbol: bankTx.bankAccount?.currency?.symbol,
        transactionSide: bankTx.transactionSide,
        bankAmount: bankTx.amount,
        exchangeRate: bankTx.defaultExchangeRate,
        amount: new Decimal(bankTx.amount).dividedBy(
          new Decimal(bankTx.defaultExchangeRate)
        ),
        bankCurrencyId: bankTx.bankAccount.currencyId,
        bankAccountId: bankTx.bankAccountId,
        bankTransactionBatchId: bankTx.bankTransactionBatchId,
        ledgerTransactionId: bankTx.ledgerTransactionId || null,
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
