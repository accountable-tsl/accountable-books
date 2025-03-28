import {
  CategorisationStatus,
  DebitCredit,
  JournalStatus,
  LedgerTransaction,
  ProjectStatus,
  TransactionSource,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "@prisma/client";
import { getIdentifierType } from "../utils/utils";
import { createLedgerEntries, processLedgerTxns } from "./transactionModel";

const prisma = new PrismaClient();

interface FetchJournalFilters {
  searchQuery?: string;
  status?: JournalStatus[];
  startDate?: Date;
  endDate?: Date;
  includeEntries?: boolean;
  page?: number;
  pageSize?: number;
}

interface JournalEntryInput {
  date?: Date;
  description?: string;
  side: DebitCredit;
  amount: Decimal;
  coaAccountId: string;
  projectName?: string;
  projectId?: string;
}

export type JournalData = {
  date: Date;
  description: string;
  note?: string;
  transactions: JournalEntryInput[];
  status: JournalStatus;
  autoReversalDate?: Date;
  generatedFromTemplateId?: string;
};

export async function fetchJournals(
  companyIdentifier: string,
  filters?: FetchJournalFilters
) {
  try {
    const companyIdType = getIdentifierType(companyIdentifier);

    const companyData = await prisma.company.findUnique({
      where: {
        ...(companyIdType === "uuid"
          ? { id: companyIdentifier }
          : { shortCode: companyIdentifier }),
      },
      select: { id: true },
    });

    const companyId = companyData?.id;

    let where: any = {
      companyId,
      isDeleted: false,
    };

    if (filters?.searchQuery) {
      const searchQuery = filters.searchQuery.toUpperCase() || "";

      if (Object.values(JournalStatus).includes(searchQuery as JournalStatus)) {
        where.OR = [
          { status: searchQuery as JournalStatus },
          { description: { search: `${searchQuery}:*`, mode: "insensitive" } },
          { note: { search: `${searchQuery}:*`, mode: "insensitive" } },
        ];
      } else {
        where.OR = [
          { description: { search: `${searchQuery}:*`, mode: "insensitive" } },
          { note: { search: `${searchQuery}:*`, mode: "insensitive" } },
        ];
      }
    }

    const journals = await prisma.journalBatch.findMany({
      where,
      include: {
        journalTransactions: { select: { side: true, amount: true } },
      },
      omit: {
        companyId: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    const result = journals.map((batch) => {
      const { totalDebit, totalCredit } = batch.journalTransactions.reduce(
        (acc, tx) => {
          const amt = new Decimal(tx.amount).abs();

          if (tx.side === DebitCredit.DEBIT) {
            acc.totalDebit = acc.totalDebit.plus(amt);
          } else if (tx.side === DebitCredit.CREDIT) {
            acc.totalCredit = acc.totalCredit.plus(amt);
          }
          return acc;
        },
        { totalDebit: new Decimal(0), totalCredit: new Decimal(0) }
      );

      return {
        ...batch,
        totalDebit,
        totalCredit,
      };
    });

    const count = await prisma.journalBatch.count({
      where,
    });

    if (journals) {
      return {
        success: true,
        data: {
          journals: result,
          count,
        },
      };
    } else {
      return {
        success: false,
        message: "An unexpected error occurred",
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to retrieve transactions",
      ...(process.env.NODE_ENV === "development" && { error: error.message }),
    };
  }
}

export async function fetchJournalById(companyId: string, journalId: string) {
  try {
    const companyIdType = getIdentifierType(companyId);

    const journal = await prisma.journalBatch.findFirst({
      where: {
        id: journalId,
        ...(companyIdType === "uuid"
          ? { companyId }
          : { company: { shortCode: companyId } }),
        isDeleted: false,
      },
      include: {
        journalTransactions: {
          include: { coaAccount: { select: { accountName: true } } },
        },
      },
      omit: {
        companyId: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (journal) {
      return {
        success: true,
        data: journal,
      };
    } else {
      return {
        success: false,
        message: "Journal not found",
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: "An unexpected error occurred",
      ...(process.env.NODE_ENV === "development" && { error }),
    };
  }
}

export async function insertJournalRecords(
  companyIdentifier: string,
  userIdentifier: string,
  journalData: JournalData[]
) {
  // Validate companyId and journalData, ensure company exists, journalData is not empty, is an arry, and all required fields are present
  const companyIdType = getIdentifierType(companyIdentifier);

  const [companyData, userData] = await Promise.all([
    prisma.company.findUnique({
      where: {
        ...(companyIdType === "uuid"
          ? { id: companyIdentifier }
          : { shortCode: companyIdentifier }),
      },
      select: { id: true, reportingCurrencyId: true },
    }),

    prisma.user.findUnique({
      where: {
        id: userIdentifier,
      },
      select: { id: true },
    }),
  ]);

  const companyId = companyData?.id;
  const reportingCurrencyId = companyData?.reportingCurrencyId;
  const userId = userData?.id;

  if (
    !companyIdentifier ||
    !journalData ||
    !companyId ||
    !reportingCurrencyId ||
    !userId
  ) {
    return { success: false, message: "Bad Request" };
  }

  if (!Array.isArray(journalData) || journalData.length === 0) {
    return {
      success: false,
      message: "Journal data must be a non-empty array",
    };
  }

  try {
    const errorString: string[] = [];

    const allCoaIds = journalData.flatMap((b) =>
      b.transactions.map((t) => t.coaAccountId)
    );
    const validCoas = await prisma.coa.findMany({
      where: { id: { in: allCoaIds } },
    });
    const validCoaIds = new Set(validCoas.map((c) => c.id));

    // Validate all batches and transactions
    for (const [batchIndex, batch] of journalData.entries()) {
      // Batch-level validation
      if (
        !batch.date ||
        !batch.description ||
        !batch.status ||
        !Object.values(JournalStatus).includes(batch.status)
      ) {
        errorString.push(
          `Batch ${batchIndex + 1}: Missing required fields (date, description, status)`
        );
      }

      if (
        !Array.isArray(batch.transactions) ||
        batch.transactions.length === 0
      ) {
        errorString.push(`Batch ${batchIndex + 1}: No transactions provided`);
      } else {
        // Transaction-level validation and balance check
        let totalDebit = new Decimal(0);
        let totalCredit = new Decimal(0);

        for (const [txIndex, transaction] of batch.transactions.entries()) {
          if (!validCoaIds.has(transaction.coaAccountId)) {
            errorString.push(
              `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Invalid coaAccountId`
            );
          }

          if (
            !transaction.side ||
            (transaction.side !== DebitCredit.DEBIT &&
              transaction.side !== DebitCredit.CREDIT) ||
            !transaction.amount ||
            new Decimal(transaction.amount).isNaN() ||
            new Decimal(transaction.amount).isZero() ||
            !transaction.coaAccountId
          ) {
            errorString.push(
              `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Missing required fields`
            );
          } else {
            // Only accumulate if validation passes for this transaction
            if (transaction.side === DebitCredit.DEBIT) {
              if (new Decimal(transaction.amount).isNegative()) {
                // ❌ Debit must be positive
                errorString.push(
                  `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Debit amount cannot be negative`
                );
              }
              totalDebit = totalDebit.add(new Decimal(transaction.amount));
            } else {
              if (new Decimal(transaction.amount).isPositive()) {
                // ❌ Credit must be negative
                errorString.push(
                  `Batch ${batchIndex + 1}, Transaction ${txIndex + 1}: Credit amount cannot be positive`
                );
              }
              totalCredit = totalCredit.add(new Decimal(transaction.amount));
            }
          }
        }

        const balance = totalDebit.plus(totalCredit);
        if (!balance.isZero()) {
          errorString.push(
            `Batch ${batchIndex + 1}: Debits (${totalDebit.abs()}) do not match credits (${totalCredit.abs()})`
          );
        }
      }
    }

    // If there are errors, return at this point
    if (errorString.length > 0) {
      return {
        success: false,
        message: "Validation failed",
        errors: errorString,
      };
    }

    // Insert journal records into database (if no errors)
    const createdJournalBatches = await prisma.$transaction(async (tx) => {
      // Get current max sequence number for the company

      const createdBatches = [];
      let totalEntries = 0;

      let sequenceNumber =
        (
          await tx.journalBatch.findFirst({
            where: { companyId },
            orderBy: { sequenceNumber: "desc" },
            select: { sequenceNumber: true },
          })
        )?.sequenceNumber || 0;

      for (const batch of journalData) {
        //Handle potential sequence concurrency issues later
        sequenceNumber += 1;

        if (batch.status === JournalStatus.POSTED) {
          const ledgerTxn = await tx.ledgerTransaction.create({
            data: {
              date: batch.date,
              description: batch.description,
              source: TransactionSource.MANUAL_JOURNAL,
              companyId,
              createdById: userId,
              updatedById: userId,
            },
          });
          // Create JournalBatch
          const newBatch = await tx.journalBatch.create({
            data: {
              companyId,
              sequenceNumber: sequenceNumber,
              date: batch.date,
              description: batch.description,
              status: batch.status,
              note: batch.note,
              autoReversalDate: batch.autoReversalDate,
              generatedFromTemplateId: batch.generatedFromTemplateId,
              createdById: userId,
              updatedById: userId,
              postedAt: new Date(),
              postedById: userId,
              ledgerTransactionId: ledgerTxn.id,
            },
          });

          const ledgerEntries = await Promise.all(
            batch.transactions.map(async (transaction) => {
              let projectId = transaction.projectId;
              let projectName = transaction.projectName;
              let project;

              if (projectId) {
                project = await tx.project.findUnique({
                  where: { id: projectId },
                });
              } else if (projectName) {
                project = await tx.project.findFirst({
                  where: { name: projectName, companyId },
                });
              }

              if (!project && projectName) {
                project = await tx.project.create({
                  data: {
                    name: projectName,
                    companyId,
                    status: ProjectStatus.ACTIVE,
                  },
                });

                projectId = project.id;
              }

              const ledgerEntry = await tx.ledgerEntry.create({
                data: {
                  ledgerTransactionId: ledgerTxn.id,
                  fsDate: transaction.date || batch.date,
                  coaId: transaction.coaAccountId,
                  transactionSide: transaction.side,
                  sourceCurrencyId: reportingCurrencyId,
                  sourceAmount: new Decimal(transaction.amount),
                  absoluteSourceAmount: new Decimal(transaction.amount).abs(),
                  systemExchangeRate: new Decimal(1),
                  customExchangeRate: new Decimal(1),
                  amount: new Decimal(transaction.amount),
                  absoluteAmount: new Decimal(transaction.amount).abs(),
                  categorisationStatus: CategorisationStatus.CATEGORISED,
                  description: transaction.description || batch.description,
                  ...(projectId ? { projectId: projectId } : {}),
                  updatedById: userId,
                },
              });

              return ledgerEntry;
            })
          );

          const journalEntriesData = batch.transactions.map(
            (transaction, index) => ({
              description: transaction.description || batch.description,
              side: transaction.side,
              amount: new Decimal(transaction.amount),
              coaAccountId: transaction.coaAccountId,
              journalBatchId: newBatch.id,
              ledgerEntryId: ledgerEntries[index].id,
            })
          );

          await tx.journalEntry.createMany({
            data: journalEntriesData,
          });

          createdBatches.push(newBatch);
          totalEntries += journalEntriesData.length;
        } else {
          // Create JournalBatch
          const newBatch = await tx.journalBatch.create({
            data: {
              companyId,
              sequenceNumber: sequenceNumber,
              date: batch.date,
              description: batch.description,
              status: batch.status,
              note: batch.note,
              createdById: userId,
              autoReversalDate: batch.autoReversalDate,
              generatedFromTemplateId: batch.generatedFromTemplateId,
              updatedById: userId,
            },
          });

          const journalEntriesData = batch.transactions.map((transaction) => ({
            description: transaction.description || batch.description,
            side: transaction.side,
            amount: new Decimal(transaction.amount),
            coaAccountId: transaction.coaAccountId,
            journalBatchId: newBatch.id,
          }));

          await tx.journalEntry.createMany({
            data: journalEntriesData,
          });

          createdBatches.push(newBatch);
          totalEntries += journalEntriesData.length;
        }
      }

      return createdBatches;
    });

    return {
      success: true,
      message: "Journal records created successfully",
      data: {
        createdBatchIds: createdJournalBatches.map(
          (batch) => `Journal Batch ${batch.sequenceNumber}`
        ),
      },
    };
  } catch (error: any) {
    console.error("Error in insertJournal:", error);
    return {
      success: false,
      message: "Failed to create journal records",
      ...(process.env.NODE_ENV === "development" && {
        error: error.message,
      }),
    };
  }
}

export async function insertRecurringJournal() {}

export async function updateSingleJournal() {}
export async function insertReversalJournal() {}
export async function markJournalAsDeleted() {}
