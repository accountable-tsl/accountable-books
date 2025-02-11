import {
  CategorisationStatus,
  DebitCredit,
  Prisma,
  PrismaClient,
  TransactionSource,
} from "@prisma/client";
import {
  getBankTransactionById,
  TransactionFilters,
} from "./bankTransactionModel";
import { Decimal } from "@prisma/client/runtime/library";
import { compareDbAndUserObject, getIdentifierType } from "../utils/utils";
import { connect } from "http2";

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
        coa?: { select: { id: true; accountCode: true; accountName: true } };
        sourceCurrency?: { select: { code: true } };
        project?: { select: { name: true } };
      };
    };
  };
}>;

export type CatEngineTransaction = {
  id: string;
  transactionSource: string;
  categorisationStatus: CategorisationStatus[] | CategorisationStatus;
  bankLogo?: string | null;
  bankName?: string | null;
  date: Date;
  fsDate: Date;
  contactName: string;
  reference: string;
  description: string;
  bankCurrencyCode: string;
  bankCurrencyId: string;
  bankCurrencySymbol?: string;
  transactionSide: DebitCredit | null;
  bankAmount?: Decimal;
  exchangeRate: Decimal;
  amount: Decimal;
  bankAccountId?: string | null;
  bankTransactionBatchId?: string | null;
  ledgerTransactionId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  coaId?: string | null;
  coaAccountName?: string | null;
  coaAccountCode?: string | null;
  companyId?: string;
  userId?: string;
  notes?: string;
};

const buildBankTransactionFilters = (
  companyId: string,
  filters: TransactionFilters
) => {
  const companyIdType = getIdentifierType(companyId);

  const where: Prisma.BankTransactionWhereInput = {
    isDeleted: filters.isDeleted ?? false,
    ledgerTransactionId: null,
    ledgerTransaction: null,
    bankAccount: {
      companyId: companyIdType === "uuid" ? companyId : undefined,
      company: companyIdType !== "uuid" ? { shortCode: companyId } : undefined,
    },
  };

  // Ensure categorisationStatus is always an array
  const status: CategorisationStatus[] = Array.isArray(
    filters.categorisationStatus
  )
    ? filters.categorisationStatus
    : filters.categorisationStatus
      ? [filters.categorisationStatus]
      : [
          CategorisationStatus.UNCATEGORISED,
          CategorisationStatus.AUTO_CATEGORISED,
        ];

  where.categorisationStatus = {
    ...{ in: status },
    ...{ notIn: [CategorisationStatus.CATEGORISED] },
  };

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
  const companyIdType = getIdentifierType(companyId);

  const where: Prisma.LedgerTransactionWhereInput = {
    bankTransactionId: { not: null },
    bankTransaction: { isNot: null },
    isDeleted: filters.isDeleted ?? false,
    ledgerEntries: {
      some: {
        isDeleted: filters.isDeleted ?? false,
        coa: {
          ...(companyIdType === "uuid"
            ? { companyId: companyId }
            : { company: { shortCode: companyId } }),
        },
      },
    },
  };

  const ledgerEntries = where.ledgerEntries?.some;

  // Ensure categorisationStatus is always an array
  const status: CategorisationStatus[] = Array.isArray(
    filters.categorisationStatus
  )
    ? filters.categorisationStatus
    : filters.categorisationStatus
      ? [filters.categorisationStatus]
      : ["UNCATEGORISED", "AUTO_CATEGORISED"];

  if (filters.bankAccountId) {
    where.bankTransaction = { bankAccount: { id: filters.bankAccountId } };
  }

  if (ledgerEntries) {
    ledgerEntries.categorisationStatus = { in: status };

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

  if (!tx.ledgerEntries) return [];

  return Array.isArray(tx.ledgerEntries)
    ? tx.ledgerEntries
        .filter(
          (entry: LedgerEntriesWithRelations) => entry.coaId !== bankCoaId
        )
        .map(({ ...ledger }: LedgerEntriesWithRelations) => ({
          id: ledger.id,
          transactionSource: "ledger",
          categorisationStatus: ledger.categorisationStatus,
          date: tx.date,
          fsDate: ledger.fsDate,
          contactName: tx.contact?.name || "",
          projectName: ledger.project?.name || null,
          reference: tx.reference || "",
          description: ledger.description || "",
          bankCurrencyCode: ledger.sourceCurrency.code,
          bankCurrencySymbol: ledger.sourceCurrency.symbol,
          transactionSide: ledger.transactionSide,
          exchangeRate: ledger.customExchangeRate,
          amount: ledger.amount,
          bankCurrencyId: ledger.sourceCurrencyId,
          ...(tx.bankTransaction
            ? {
                bankAmount: tx.bankTransaction.amount,
                bankAccountId: tx.bankTransaction.bankAccountId,
                bankTransactionBatchId:
                  tx.bankTransaction.bankTransactionBatchId,
                bankLogo:
                  tx.bankTransaction.bankAccount?.bank?.bankLogo || null,
                bankName: tx.bankTransaction.bankAccount?.displayName || null,
              }
            : {}),
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

    const page = filters.currentPage || 1;
    const pageSize = filters.pageSize ? filters.pageSize : 100;

    const bankTransactions = await prisma.bankTransaction.findMany({
      where: bankTransactionFilters,
      include: {
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

    const bankCount = await prisma.bankTransaction.count({
      where: bankTransactionFilters,
    });
    const ledgerCount = await prisma.ledgerTransaction.count({
      where: ledgerTransactionFilters,
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
        exchangeRate: bankTx.systemExchangeRate,
        amount: new Decimal(bankTx.amount).dividedBy(
          new Decimal(bankTx.systemExchangeRate)
        ),
        bankCurrencyId: bankTx.bankAccount.currencyId,
        bankAccountId: bankTx.bankAccountId,
        bankTransactionBatchId: bankTx.bankTransactionBatchId,
        ledgerTransactionId: bankTx.ledgerTransactionId || null,
      })),
      ...flattenedAccountTransactions,
    ].sort((a, b) => {
      // First, sort by bankName
      const bankNameComparison = (a.bankName || "").localeCompare(
        b.bankName || ""
      );
      if (bankNameComparison !== 0) {
        return bankNameComparison;
      }

      // If bankNames are the same, sort by date
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // const count = transactions.length;
    const count = bankCount + ledgerCount;

    return {
      success: true,
      message: "Bank transactions retrieved successfully",
      data: { transactions, count, currentPage: page, pageSize },
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

interface LedgerEntryInput {
  fsDate: Date;
  ledgerTransactionId?: string;
  categorisationStatus: CategorisationStatus;
  coaId: string;
  transactionSide: DebitCredit;
  sourceCurrencyId: string;
  sourceAmount: Decimal;
  absoluteSourceAmount: Decimal;
  systemExchangeRate: Decimal;
  customExchangeRate: Decimal;
  amount: Decimal;
  absoluteAmount: Decimal;
  description?: string | null;
  projectId?: string | null;
  journalEntry?: any;
  updatedById?: string | null;
}

type TransactionLedgerDetails = {
  date: Date;
  fsDate: Date;
  contactName?: string;
  description?: string;
  userId?: string | null;
  source: TransactionSource;
  reference?: string;
  bankTransactionId: string;
  companyId: string;
  notes?: string;
  createdById?: string;
  firstCategorisedById: string;
  updatedById: string;
  sourceCurrencyId: string;

  debitLedgerEntry: LedgerEntryInput;
  creditLedgerEntry: LedgerEntryInput;
};

/**
 * CREATE new ledger entries for bank transactions.
 *
 * 1. Validates necessary fields (coaId, id, companyId, etc.).
 * 2. Fetches the corresponding bank transaction from the DB.
 * 3. Optionally creates Contact/Project if provided and not existing.
 * 4. Creates a new LedgerTransaction record.
 * 5. Creates two ledger entries (DEBIT and CREDIT) per transaction.
 * 6. Updates the BankTransaction record’s categorisation status.
 *
 * The sum of DEBIT and CREDIT for any single transaction is always 0
 * (they're mirrored in absolute terms).
 */
export async function createLedgerEntries(tx: CatEngineTransaction[]) {
  const ledgerPostingFailed: any[] = [];
  const ledgerSuccessfullyPosted: any[] = [];

  if (!tx || tx.length === 0) {
    return {
      success: false,
      message: "No valid transactions provided.",
      data: { ledgerSuccessfullyPosted, ledgerPostingFailed },
    };
  }

  try {
    // We use a single Prisma transaction for all inserts/updates.
    // If any iteration fails, everything rolls back for data consistency.
    await prisma.$transaction(async (prisma) => {
      for (const t of tx) {
        if (
          !t.coaId ||
          !t.id ||
          !t.companyId ||
          !t.exchangeRate ||
          t.transactionSource.toLocaleLowerCase() !== "bank"
        ) {
          ledgerPostingFailed.push(t);
          continue;
        }

        const companyIdType = getIdentifierType(t.companyId);

        const companyData = await prisma.company.findUnique({
          where: {
            ...(companyIdType === "uuid"
              ? { id: t.companyId }
              : { shortCode: t.companyId }),
          },
          select: { id: true },
        });

        if (!companyData) {
          ledgerPostingFailed.push(t);
          continue;
        }

        const companyId = companyData.id;

        const existingLedgerTx = await prisma.ledgerTransaction.findUnique({
          where: {
            bankTransactionId_bankTransactionDate: {
              bankTransactionId: t.id,
              bankTransactionDate: t.date,
            },
          },
        });

        if (existingLedgerTx) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error:
              "Ledger transaction already exists for this bank transaction.",
          });
          continue;
        }

        // Retrieve the bank transaction from DB
        const bankTx = await getBankTransactionById(companyId, t.id);
        if (!bankTx.success || !bankTx.data) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error: "Bank transaction not found",
          });
          continue;
        }

        const bTx = bankTx.data;

        //Create contact if needed
        let contactId: string = t.contactId as string;

        // Create contact if `contactName` is provided and `contactId` is missing
        if (t.contactName && !t.contactId) {
          const contact = await prisma.contact.upsert({
            where: {
              name_companyId: { name: t.contactName, companyId },
            },
            create: { name: t.contactName, companyId: companyId },
            update: {},
          });
          contactId = contact.id;
        }

        if (!t.contactName && !t.contactId && (t.projectId || t.projectName)) {
          // Handle "No Contact" if neither `contactName` nor `contactId` is provided
          const noContact = await prisma.contact.upsert({
            where: {
              name_companyId: { name: "No Contact", companyId },
            },
            create: {
              name: "No Contact",
              companyId,
            },
            update: {},
          });
          contactId = noContact.id;
        }

        if ((t.contactName || t.contactId) && !contactId) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error: "Error creating contact",
          });
        }

        //Create project if needed
        if (!t.projectId && t.projectName) {
          const project = await prisma.project.create({
            data: {
              name: t.projectName,
              companyId,
              contactId,
            },
            include: { contact: true },
          });

          if (!project) {
            ledgerPostingFailed.push({
              id: t.id,
              source: t.transactionSource,
              error: "Error creating project",
            });
            continue;
          }

          t.projectId = project.id;
        }

        // Decide categorisation status
        const categorisationStatus: CategorisationStatus = t.userId
          ? "CATEGORISED"
          : "AUTO_CATEGORISED";

        // Build the data needed for LedgerTransaction
        const ledgerTxData = {
          date: bTx.date,
          description: bTx.description || t.description || null,
          source: "BANK" as TransactionSource,
          reference: bTx.reference || t.reference || null,
          bankTransaction: {
            connect: { id_date: { id: bTx.id, date: bTx.date } },
          },
          company: {
            connect: { id: companyId },
          },
          notes: t.notes,
          createdBy: { connect: { id: t.userId as string } },
          updatedBy: { connect: { id: t.userId as string } },
          ...(contactId && { contact: { connect: { id: contactId } } }),
        };

        // Decide which side gets the bank account vs. the COA
        // Bank Account is an asset account, Money in is Debit, Money out is credit
        // The assumption: If bTx.amount > 0 => DEBIT bank, CREDIT user-specified COA
        //                 If bTx.amount < 0 => CREDIT bank, DEBIT user-specified COA

        const isAmountPositive = new Decimal(bTx.amount).gt(new Decimal(0));

        // Common fields for both DEBIT & CREDIT
        // Mirror the absolute amounts to ensure sum = 0
        const absoluteAmount = Decimal.abs(
          new Decimal(bTx.amount).div(new Decimal(t.exchangeRate))
        );

        const debitEntry: LedgerEntryInput = {
          transactionSide: "DEBIT",
          coaId: isAmountPositive ? bTx.bankAccount.coaId : t.coaId,
          categorisationStatus,
          sourceAmount: Decimal.abs(bTx.amount), //Raw amount from bank transaction
          absoluteSourceAmount: Decimal.abs(bTx.amount),
          sourceCurrencyId: bTx.bankAccount.currencyId,
          fsDate: t.fsDate ? t.fsDate : (bTx.date as Date),
          systemExchangeRate: bTx.systemExchangeRate,
          customExchangeRate: t.exchangeRate,
          amount: absoluteAmount,
          absoluteAmount,
          description: t.description || bTx.description || null,
          // ...(t.projectId && { projectId: t.projectId }),
          ...(t.projectId && { project: { connect: { id: t.projectId } } }),
          ...(t.userId && { updatedById: t.userId as string }),
        };

        const creditEntry: LedgerEntryInput = {
          transactionSide: "CREDIT",
          coaId: isAmountPositive ? t.coaId : bTx.bankAccount.coaId,
          categorisationStatus,
          sourceAmount: Decimal.abs(bTx.amount).neg(),
          absoluteSourceAmount: Decimal.abs(bTx.amount),
          sourceCurrencyId: bTx.bankAccount.currencyId,
          fsDate: t.fsDate ? t.fsDate : (bTx.date as Date),
          systemExchangeRate: bTx.systemExchangeRate,
          customExchangeRate: t.exchangeRate,
          amount: absoluteAmount.neg(),
          absoluteAmount,
          description: t.description || bTx.description,
          ...(t.projectId && { projectId: t.projectId }),
          ...(t.userId && { updatedById: t.userId as string }),
        };

        // Update bankTransaction categorisationStatus and other info,
        // Maybe remove isCategorised, categorisedById, categorisedAt, totally from BankTransaction schema
        // If t.contactName, create contact, if t.projectName, create project

        // 1) Create the LedgerTransaction
        const createdLedgerTx = await prisma.ledgerTransaction.create({
          data: ledgerTxData,
        });

        if (!createdLedgerTx) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error: "Could not create ledger transaction",
          });
        }

        // 2) Create the DEBIT & CREDIT LedgerEntries
        const entries = await prisma.ledgerEntry.createMany({
          data: [
            { ...debitEntry, ledgerTransactionId: createdLedgerTx.id },
            { ...creditEntry, ledgerTransactionId: createdLedgerTx.id },
          ],
        });

        if (!entries) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error: "Could not create ledger entry(ies)",
          });
        }

        // 3) Update the bankTransaction to reflect new categorisation
        const bankTxUpdate = await prisma.bankTransaction.update({
          where: { id_date: { id: bTx.id, date: bTx.date } },
          data: {
            categorisationStatus,
            ledgerTransactionId: createdLedgerTx.id,
          },
        });

        if (!bankTxUpdate) {
          ledgerPostingFailed.push({
            id: t.id,
            source: t.transactionSource,
            error: "Unable to update bank transaction",
          });
        }

        ledgerSuccessfullyPosted.push(createdLedgerTx);
      }
    });

    const didAnySucceed = ledgerSuccessfullyPosted.length > 0;

    return {
      success: didAnySucceed,
      message: didAnySucceed
        ? "Ledger entries processed successfully"
        : "No ledger entries were created",
      data: { ledgerSuccessfullyPosted, ledgerPostingFailed },
    };
  } catch (error: any) {
    console.error("Error creating ledger entries:", error);
    return {
      success: false,
      message: "Failed to create ledger entries",
      error: error.message || error,
      data: { ledgerSuccessfullyPosted, ledgerPostingFailed },
    };
  }
}

export async function updateLedgerEntries(tx: CatEngineTransaction[]) {
  const updatedLedgerTransactions: any[] = [];
  const failedUpdates: CatEngineTransaction[] = [];

  try {
    if (!tx || tx.length === 0) {
      return {
        success: true,
        message: "No ledger transactions to update",
      };
    }

    await prisma.$transaction(async (prisma) => {
      for (const t of tx) {
        if (
          t.transactionSource === "bank" ||
          !t.ledgerTransactionId ||
          !t.coaId
        ) {
          failedUpdates.push(t);
          continue;
        }

        //Fetch existing ledger transaction
        const existingLedgerTx = await prisma.ledgerTransaction.findUnique({
          where: { id: t.ledgerTransactionId },
          include: { ledgerEntries: true },
        });

        if (!existingLedgerTx) {
          failedUpdates.push(t);
          continue;
        }

        const categorisationStatus: CategorisationStatus = t.userId
          ? "CATEGORISED"
          : "AUTO_CATEGORISED";

        const mappedForLedgerTx = {
          categorisationStatus,
          ...(t.reference && { reference: t.reference }),
          ...(t.contactId && { contactId: t.contactId }),
          ...(t.contactName && { contactName: t.contactName }),
          ...(t.notes && { notes: t.notes }),
          ...(t.userId && { updatedById: t.userId }),
        };

        const mappedForLedgerEntry = {
          ...(t.coaId && { coaId: t.coaId }),
          ...(t.fsDate && { fsDate: t.fsDate }),
          ...(t.exchangeRate && { customExchangeRate: t.exchangeRate }),
          ...(t.description && { description: t.description }),
          ...(t.projectId && { projectId: t.projectId }),
          ...(t.projectName && { projectName: t.projectName }),
          ...(t.userId && { updatedById: t.userId }),
        };

        if (!mappedForLedgerEntry && !mappedForLedgerTx) {
          failedUpdates.push(t);
          continue;
        }

        if (mappedForLedgerTx.contactName && !mappedForLedgerTx.contactId) {
          const contact = await prisma.contact.create({
            data: {
              name: mappedForLedgerTx.contactName,
              companyId: existingLedgerTx.companyId,
            },
          });
          mappedForLedgerTx.contactId = contact.id;
        }

        if (
          !mappedForLedgerEntry.projectId &&
          mappedForLedgerEntry.projectName &&
          !mappedForLedgerTx.contactId
        ) {
          const noContact = await prisma.contact.upsert({
            where: {
              name_companyId: {
                name: "No Contact",
                companyId: existingLedgerTx.companyId,
              },
            },
            create: {
              name: "No Contact",
              companyId: existingLedgerTx.companyId,
            },
            update: {},
          });
          mappedForLedgerTx.contactId = noContact.id;
        }

        if (
          !mappedForLedgerEntry.projectId &&
          mappedForLedgerEntry.projectName &&
          mappedForLedgerTx.contactId
        ) {
          const project = await prisma.project.create({
            data: {
              name: mappedForLedgerEntry.projectName,
              companyId: existingLedgerTx.companyId,
              contactId: mappedForLedgerTx.contactId,
            },
            include: { contact: true },
          });

          mappedForLedgerEntry.projectId = project.id;
        }

        const ledgerTxUpdates = compareDbAndUserObject(
          existingLedgerTx,
          mappedForLedgerTx
        );

        const hasOnlyStatus =
          Object.keys(ledgerTxUpdates).length === 1 &&
          ledgerTxUpdates.hasOwnProperty("categorisationStatus");

        if (hasOnlyStatus) {
          failedUpdates.push(t);
          continue;
        }

        const updatedLedgerTransaction = await prisma.ledgerTransaction.update({
          where: { id: existingLedgerTx.id },
          data: ledgerTxUpdates,
        });

        const { projectName, ...rest } = mappedForLedgerEntry;

        for (const entry of existingLedgerTx.ledgerEntries) {
          const entryUpdates = {
            ...rest,
            ...(rest.customExchangeRate && {
              amount: new Decimal(entry.sourceAmount).div(
                new Decimal(rest.customExchangeRate)
              ),
              absoluteAmount: Decimal.abs(
                new Decimal(entry.sourceAmount).div(
                  new Decimal(rest.customExchangeRate)
                )
              ),
            }),
          };

          await prisma.ledgerEntry.update({
            where: { id_fsDate: { id: entry.id, fsDate: entry.fsDate } },
            data: entryUpdates,
          });
        }

        if (
          existingLedgerTx.bankTransactionId &&
          existingLedgerTx.bankTransactionDate
        )
          await prisma.bankTransaction.update({
            where: {
              id_date: {
                id: existingLedgerTx.bankTransactionId,
                date: existingLedgerTx.bankTransactionDate,
              },
            },
            data: {
              categorisationStatus,
            },
          });

        updatedLedgerTransactions.push(updatedLedgerTransaction);
      }
    });

    return {
      success: true,
      message: "Ledger transactions updated successfully.",
      data: { updatedLedgerTransactions, failedUpdates },
    };
  } catch (error: any) {
    console.error("Error updating ledger entries:", error);
    return {
      success: false,
      message: "Failed to update ledger entries.",
      data: { updatedLedgerTransactions, failedUpdates },
      error: error.message || error,
    };
  }
}
