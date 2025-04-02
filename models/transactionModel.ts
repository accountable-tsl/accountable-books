import {
  CategorisationStatus,
  DebitCredit,
  Prisma,
  PrismaClient,
  ProjectStatus,
  TransactionSource,
} from "@prisma/client";
import {
  getBankTransactionById,
  TransactionFilters,
} from "./bankTransactionModel";
import { Decimal } from "@prisma/client/runtime/library";
import { compareDbAndUserObject, getIdentifierType } from "../utils/utils";
import { BankTransactionWhereInput } from "../types/bank";
import { Knex } from "knex";
// import initKnex from "knex";
// import configuration from "../knexfile";
import knexInstance from "../knexClient";

const prisma = new PrismaClient();

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
  queryBuilder: Knex.QueryBuilder,
  companyId: string,
  filters: TransactionFilters
) => {
  const companyIdType = getIdentifierType(companyId);

  queryBuilder.where(
    `"BankTransaction"."isDeleted"`,
    filters.isDeleted ?? false
  );

  queryBuilder.whereNull(`"BankTransaction"."ledgerTransactionId"`);

  // Bank account ID filter
  if (filters.bankAccountId) {
    queryBuilder.where(
      `"BankTransaction"."bankAccountId"`,
      filters.bankAccountId
    );
  }

  // Date range filters
  if (filters.startDate || filters.endDate) {
    if (filters.startDate) {
      queryBuilder.where(`"BankTransaction"."date"`, ">=", filters.startDate);
    }
    if (filters.endDate) {
      queryBuilder.where(`"BankTransaction"."date"`, "<=", filters.endDate);
    }
  }

  // Amount range filters
  if (filters.minAmount || filters.maxAmount) {
    if (filters.minAmount) {
      queryBuilder.where(
        `"BankTransaction"."absoluteAmount"`,
        ">=",
        filters.minAmount
      );
    }

    if (filters.maxAmount) {
      queryBuilder.where(
        `"BankTransaction"."absoluteAmount"`,
        "<=",
        filters.maxAmount
      );
    }
  }

  // Categorisation status filter
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

  queryBuilder.whereIn(`"BankTransaction"."categorisationStatus"`, status);
  queryBuilder.whereNotIn(`"BankTransaction"."categorisationStatus"`, [
    CategorisationStatus.CATEGORISED,
  ]);

  if (filters.transactionSide) {
    queryBuilder.where(
      `"BankTransaction"."transactionSide"`,
      filters.transactionSide
    );
  }

  if (filters.searchQuery) {
    queryBuilder.whereRaw(
      `to_tsvector('english', concat_ws(' ', 
        "BankTransaction"."description", 
        "BankTransaction"."reference", 
        "BankTransaction"."payee"
      )) @@ plainto_tsquery('english', ?)`,
      [filters.searchQuery]
    );
  }

  // Company join filter
  queryBuilder.join(
    "BankAccount",
    `"BankTransaction"."bankAccountId"`,
    `"BankAccount"."id"`
  );

  if (companyIdType === "uuid") {
    queryBuilder.where(`"BankAccount"."companyId"`, companyId);
  } else {
    queryBuilder
      .join("Company", `"BankAccount"."companyId"`, `"Company"."id"`)
      .where(`"Company"."shortCode"`, companyId);
  }

  return queryBuilder;
};
const buildLedgerTransactionFilters = (
  queryBuilder: Knex.QueryBuilder,
  companyId: string,
  filters: TransactionFilters
) => {
  const companyIdType = getIdentifierType(companyId);

  // Base query: LedgerTransaction must have a bankTransaction and a matching LedgerEntry.
  queryBuilder
    .from("LedgerTransaction")
    .distinct("LedgerTransaction.id")
    .where("LedgerTransaction.isDeleted", filters.isDeleted ?? false)
    .whereNotNull("LedgerTransaction.bankTransactionId")
    .join(
      "BankTransaction",
      "LedgerTransaction.bankTransactionId",
      "BankTransaction.id"
    )
    // Join LedgerEntry to apply filters and later include it in the result
    .join(
      "LedgerEntry",
      "LedgerTransaction.id",
      "LedgerEntry.ledgerTransactionId"
    )
    .where("LedgerEntry.isDeleted", filters.isDeleted ?? false)
    // Join Coa for company filtering and to mimic include behavior
    .join("Coa", "LedgerEntry.coaId", "Coa.id");

  // Company filter via Coa
  if (companyIdType === "uuid") {
    queryBuilder.where("Coa.companyId", companyId);
  } else {
    queryBuilder
      .join("Company", "Coa.companyId", "Company.id")
      .where("Company.shortCode", companyId);
  }

  // Categorization status filter
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

  queryBuilder.whereIn("LedgerEntry.categorisationStatus", status);
  queryBuilder.whereNotIn("LedgerEntry.categorisationStatus", [
    CategorisationStatus.CATEGORISED,
  ]);

  // Optional bank account filter (via BankTransaction's bankAccountId)
  if (filters.bankAccountId) {
    queryBuilder
      .join("BankAccount", "BankTransaction.bankAccountId", "BankAccount.id")
      .where("BankAccount.id", filters.bankAccountId);
  }

  // Date range filter on LedgerEntry.fsDate
  if (filters.startDate) {
    queryBuilder.where("LedgerEntry.fsDate", ">=", filters.startDate);
  }
  if (filters.endDate) {
    queryBuilder.where("LedgerEntry.fsDate", "<=", filters.endDate);
  }

  // Amount range filter on LedgerEntry.absoluteSourceAmount
  if (filters.minAmount) {
    queryBuilder.where(
      "LedgerEntry.absoluteSourceAmount",
      ">=",
      filters.minAmount
    );
  }
  if (filters.maxAmount) {
    queryBuilder.where(
      "LedgerEntry.absoluteSourceAmount",
      "<=",
      filters.maxAmount
    );
  }

  // Transaction side filter on LedgerEntry
  if (filters.transactionSide) {
    queryBuilder.where("LedgerEntry.transactionSide", filters.transactionSide);
  }

  // Full-text search on LedgerEntry fields: description, reference, and notes.
  if (filters.searchQuery?.trim()) {
    queryBuilder.whereRaw(
      `to_tsvector('english', concat_ws(' ', 
        "LedgerEntry"."description", 
        "LedgerEntry"."reference", 
        "LedgerEntry"."notes"
      )) @@ plainto_tsquery('english', ?)`,
      [filters.searchQuery]
    );
  }

  return queryBuilder;
};
const transformLedgerTransactionRow = (row: any): CatEngineTransaction => {
  return {
    id: row.ledger_entry_id,
    transactionSource: "ledger",
    categorisationStatus: row.ledger_entry_categorisation_status,
    date: row.ledger_transaction_date,
    fsDate: row.ledger_entry_fs_date,
    contactName: row.contact_name || "",
    projectName: row.project_name || null,
    reference: row.ledger_transaction_reference || "",
    description: row.ledger_entry_description || "",
    bankCurrencyCode: row.currency_code,
    bankCurrencySymbol: row.currency_symbol,
    transactionSide: row.ledger_entry_transaction_side,
    exchangeRate: row.ledger_entry_custom_exchange_rate,
    amount: row.ledger_entry_amount,
    bankCurrencyId: row.ledger_entry_source_currency_id,
    bankAmount: row.bank_transaction_amount ?? null,
    bankAccountId: row.bank_transaction_bank_account_id ?? null,
    bankTransactionBatchId: row.bank_transaction_batch_id ?? null,
    bankLogo: row.bank_logo ?? null,
    bankName: row.bank_name ?? null,
    ledgerTransactionId: row.ledger_transaction_id,
    contactId: row.contact_id ?? null,
    projectId: row.project_id ?? null,
    coaId: row.ledger_entry_coa_id,
    coaAccountName: row.coa_account_name ?? null,
    coaAccountCode: row.coa_account_code ?? null,
  };
};

const transformBankTransactionRow = (row: any): CatEngineTransaction => {
  const amount = new Decimal(row.bank_transaction_amount);
  const exchangeRate = new Decimal(row.bank_transaction_system_exchange_rate);

  return {
    id: row.bank_transaction_id,
    transactionSource: "bank",
    categorisationStatus: row.bank_transaction_categorisation_status,
    bankLogo: row.bank_logo || null,
    bankName: row.bank_display_name || null,
    date: row.bank_transaction_date,
    fsDate: row.bank_transaction_date,
    contactName: row.bank_transaction_payee || "",
    reference: row.bank_transaction_reference || "",
    description: row.bank_transaction_description || "",
    bankCurrencyCode: row.currency_code,
    bankCurrencySymbol: row.currency_symbol,
    transactionSide: row.bank_transaction_transaction_side,
    bankAmount: amount,
    exchangeRate,
    amount: amount.dividedBy(exchangeRate),
    bankCurrencyId: row.currency_id,
    bankAccountId: row.bank_account_id,
    bankTransactionBatchId: row.bank_transaction_batch_id,
    ledgerTransactionId: row.bank_transaction_ledger_transaction_id || null,
  };
};

export async function getMergedTransactions(
  companyId: string,
  filters: TransactionFilters
) {
  try {
    const page = filters.currentPage || 1;
    const pageSize = filters.pageSize ? filters.pageSize : 100;

    // const bankTransactions = await buildBankTransactionFilters(
    //   knex("BankTransactions")
    //     .select(
    //       "bank_transactions.*",
    //       "bank_accounts.display_name as bankName",
    //       "banks.bank_logo as bankLogo",
    //       "currencies.code as bankCurrencyCode",
    //       "currencies.symbol as bankCurrencySymbol",
    //       "bank_accounts.currency_id as bankCurrencyId"
    //     )
    //     .leftJoin("banks", "bank_accounts.bank_id", "banks.id")
    //     .leftJoin("currencies", "bank_accounts.currency_id", "currencies.id"),
    //   companyId,
    //   filters
    // )
    //   .orderBy("bank_transactions.date", "asc")
    //   .orderBy("bank_transactions.created_at", "asc");

    const bankTxQuery = knexInstance("BankTransaction")
      .modify((qb) => buildBankTransactionFilters(qb, companyId, filters))
      .join(
        "BankAccount",
        '"BankTransaction"."bankAccountId"',
        '"BankAccount"."id"'
      )
      .leftJoin("Bank", '"BankAccount"."bankId"', '"Bank"."id"')
      .leftJoin("Currency", '"BankAccount"."currencyId"', '"Currency"."id"')
      .select([
        "BankTransaction.*",
        "BankAccount.id as bankAccountId",
        "BankAccount.accountNumber",
        "Bank.bankLogo",
        "Currency.id as currencyId",
        "Currency.code as currencyCode",
        "Currency.symbol as currencySymbol",
      ])
      .orderBy([
        { column: "BankTransaction.date", order: "asc" },
        { column: "BankTransaction.createdAt", order: "asc" },
      ]);
    // .offset((page - 1) * pageSize)
    // .limit(pageSize);

    const bankTransactions = await bankTxQuery;

    const bankCountResult = await knexInstance("BankTransaction")
      .modify((qb) => buildBankTransactionFilters(qb, companyId, filters))
      .count("* as count")
      .first();
    const bankCount = Number(bankCountResult.count);

    const ledgerTxQuery = knexInstance("LedgerTransaction")
      .modify((qb) => buildLedgerTransactionFilters(qb, companyId, filters))
      .leftJoin("Contact", '"LedgerTransaction"."contactId"', '"Contact"."id"')
      .leftJoin(
        "BankTransaction",
        '"LedgerTransaction"."bankTransactionId"',
        '"BankTransaction"."id"'
      )
      .leftJoin(
        "BankAccount",
        '"BankTransaction"."bankAccountId"',
        '"BankAccount"."id"'
      )
      .leftJoin("Bank", '"BankAccount"."bankId"', '"Bank"."id"')
      .leftJoin(
        "LedgerEntry",
        '"LedgerTransaction"."id"',
        '"LedgerEntry"."ledgerTransactionId"'
      )
      .leftJoin("Coa", '"LedgerEntry"."coaId"', '"Coa"."id"')
      .leftJoin(
        "SourceCurrency",
        '"LedgerEntry"."sourceCurrencyId"',
        '"SourceCurrency"."id"'
      )
      .leftJoin("Project", '"LedgerEntry"."projectId"', '"Project"."id"')
      .select([
        "LedgerTransaction.*",
        "Contact.name as contactName",
        "BankTransaction.id as bankTransactionId",
        "BankAccount.accountNumber",
        "Bank.name as bankName",
        "Bank.bankLogo",
        "LedgerEntry.id as ledgerEntryId",
        "Coa.accountCode",
        "Coa.accountName",
        "SourceCurrency.code as currencyCode",
        "SourceCurrency.symbol as currencySymbol",
        "Project.name as projectName",
      ])
      .orderBy([
        { column: "LedgerTransaction.date", order: "asc" },
        { column: "LedgerTransaction.createdAt", order: "asc" },
      ]);
    // .offset((page - 1) * pageSize)
    // .limit(pageSize);

    const accountTransactions = await ledgerTxQuery;

    const ledgerCountResult = await knexInstance("LedgerTransaction")
      .modify((qb) => buildLedgerTransactionFilters(qb, companyId, filters))
      .count("* as count")
      .first();
    const ledgerCount = Number(ledgerCountResult.count);

    const flattenedAccountTransactions = accountTransactions
      .filter((row: any) => row.ledger_entry_coa_id !== row.bank_coa_id) // contra filter
      .map(transformLedgerTransactionRow);

    const transformedbankTransactions = bankTransactions.map(
      transformBankTransactionRow
    );

    // Filter out ledger entries where coaId matches the bank account's coaId
    // This ensures we only get contra entries, not the bank account entries

    const transactions: CatEngineTransaction[] = [
      ...transformedbankTransactions,
      ...flattenedAccountTransactions,
    ].sort((a, b) => {
      const bankNameComparison = (a.bankName || "").localeCompare(
        b.bankName || ""
      );
      return bankNameComparison !== 0
        ? bankNameComparison
        : new Date(a.date).getTime() - new Date(b.date).getTime();
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

type TransactionInput = {
  date: Date;
  userId: string;
  description?: string;
  source?: TransactionSource; // Optional, defaults to MANUAL_JOURNAL
  reference?: string; // Optional for LedgerTransaction
  fsDate: Date; // For LedgerEntry
  coaId: string; // For LedgerEntry
  transactionSide: DebitCredit; // For LedgerEntry
  amount: Decimal; // For LedgerEntry (assuming Decimal as number for simplicity)
  projectId?: string; // Optional for LedgerEntry
  projectName?: string;
};

export async function processLedgerTxns(
  companyIdentifier: string,
  transactions: TransactionInput[],
  metaData?: any,
  groupBy?: string
) {
  try {
    let errors: string[] = [];

    const companyIdType = getIdentifierType(companyIdentifier);
    const companyData = await prisma.company.findUnique({
      where: {
        ...(companyIdType === "uuid"
          ? { id: companyIdentifier }
          : { shortCode: companyIdentifier }),
      },
    });

    if (!companyData) {
      return {
        success: false,
        message: "Company not found",
      };
    }

    const companyId = companyData.id;
    const reportingCurrencyId = companyData.reportingCurrencyId;

    const requiredFields = [
      "date",
      "companyId",
      "createdById",
      "fsDate",
      "coaId",
      "transactionSide",
      "sourceCurrencyId",
      "sourceAmount",
    ];

    for (const tx of transactions) {
      for (const field of requiredFields) {
        if (
          !(field in tx) ||
          tx[field as keyof TransactionInput] === undefined
        ) {
          errors.push(
            `Transaction at index ${transactions.indexOf(tx)} is missing required field: ${field}`
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: "Some transactions are missing required fields",
        errors,
      };
    }

    //Group transactions
    const groups: { [key: string]: TransactionInput[] } = {};

    if (groupBy && groupBy in transactions[0]) {
      for (const tx of transactions) {
        const key = String(tx[groupBy as keyof TransactionInput]);
        groups[key] = groups[key] || [];
        groups[key].push(tx);
      }
    } else {
      groups["all"] = transactions;
    }

    const result: { id: string; entries: string[] }[] = [];

    //Process each group
    for (const [groupKey, groupTxs] of Object.entries(groups)) {
      // Check if the group balances
      const total = groupTxs.reduce((sum, tx) => {
        return tx.transactionSide === DebitCredit.DEBIT
          ? sum.plus(tx.amount)
          : sum.minus(tx.amount);
      }, new Decimal(0));

      if (!total.equals(new Decimal(0))) {
        errors.push(`Group ${groupKey} does not balance.`);
        continue;
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: `We've tried to group transactions by '${groupBy}', but some groups do not balance`,
        errors,
      };
    }

    for (const [groupKey, groupTxs] of Object.entries(groups)) {
      const ledgerTxn = await prisma.ledgerTransaction.create({
        data: {
          date: metaData.date || groupTxs[0].date,
          companyId,
          createdById: metaData.userId || groupTxs[0].userId,
          updatedById: metaData.userId || groupTxs[0].userId,
          description: metaData.description || groupTxs[0].description,
          source:
            metaData.source ||
            groupTxs[0].source ||
            TransactionSource.MANUAL_JOURNAL,
          reference: metaData.reference || groupTxs[0].reference,
        },
      });

      const entries = await Promise.all(
        groupTxs.map(async (tx) => {
          let projectId = tx.projectId;

          if (tx.projectId) {
            const projectExists = await prisma.project.findFirst({
              where: { OR: [{ id: tx.projectId }, { name: tx.projectName }] },
            });

            if (!projectExists && tx.projectName) {
              {
                const project = await prisma.project.create({
                  data: {
                    name: tx.projectName,
                    companyId,
                    status: ProjectStatus.ACTIVE,
                  },
                });

                projectId = project.id;
              }
            }
          }
          return prisma.ledgerEntry.create({
            data: {
              ledgerTransactionId: ledgerTxn.id,
              fsDate: tx.fsDate,
              coaId: tx.coaId,
              transactionSide: tx.transactionSide,
              sourceCurrencyId: reportingCurrencyId,
              sourceAmount: new Decimal(tx.amount),
              absoluteSourceAmount: new Decimal(tx.amount).abs(),
              systemExchangeRate: new Decimal(1),
              customExchangeRate: new Decimal(1),
              amount: new Decimal(tx.amount),
              absoluteAmount: new Decimal(tx.amount).abs(),
              categorisationStatus: CategorisationStatus.CATEGORISED,
              description: tx.description,
              projectId: tx.projectId,
              updatedById: tx.userId,
            },
          });
        })
      );

      result.push({ id: ledgerTxn.id, entries: entries.map((e) => e.id) });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "An error occurred while processing the transactions",
    };
  }
}
